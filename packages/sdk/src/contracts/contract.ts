import { initEventGateway, Events, ObservableEventEmitter } from '@streamr/utils'
import type { TransactionResponse } from 'ethers'
import {
    BaseContract,
    Contract,
    ContractTransactionReceipt,
    ContractTransactionResponse,
    FunctionFragment,
} from 'ethers'
import EventEmitter from 'eventemitter3'
import without from 'lodash/without'
import pLimit from 'p-limit'
import { LoggerFactory } from '../utils/LoggerFactory'
import { ChainEventPoller, EventListenerDefinition } from './ChainEventPoller'

export interface ContractEvent {
    onMethodExecute: (methodName: string) => void
    onTransactionSubmit: (methodName: string, tx: ContractTransactionResponse) => void
    onTransactionConfirm: (methodName: string, receipt: ContractTransactionReceipt | null) => void
}

export type ObservableContract<T extends BaseContract> = T & {
    eventEmitter: EventEmitter<ContractEvent>
}

export async function waitForTx(
    txToSubmit: Promise<TransactionResponse>
): Promise<ContractTransactionReceipt> {
    const tx = await txToSubmit
    return tx.wait() as Promise<ContractTransactionReceipt> // cannot be null unless arg confirmations set to 0
}

const isTransactionResponse = (returnValue: any): returnValue is ContractTransactionResponse => {
    return (returnValue.wait !== undefined && (typeof returnValue.wait === 'function'))
}

const createLogger = (eventEmitter: EventEmitter<ContractEvent>, loggerFactory: LoggerFactory): void => {
    const logger = loggerFactory.createLogger(module)
    eventEmitter.on('onMethodExecute', (methodName: string) => {
        logger.debug('Execute method', { methodName })
    })
    eventEmitter.on('onTransactionSubmit', (methodName: string, tx: ContractTransactionResponse) => {
        logger.debug('Submit transaction', {
            method: methodName,
            tx: tx.hash,
            to: tx.to,
            nonce: tx.nonce,
            gasLimit: tx.gasLimit,
            gasPrice: tx.gasPrice
        })
    })
    eventEmitter.on('onTransactionConfirm', (methodName: string, receipt: ContractTransactionReceipt | null) => {
        logger.debug('Received transaction confirmation', {
            method: methodName,
            tx: receipt?.hash,
            block: receipt?.blockNumber,
            confirmations: receipt?.confirmations,
            gasUsed: receipt?.gasUsed,
            events: receipt?.logs ?? []
        })
    })
}

const withErrorHandling = async <T>(
    execute: () => Promise<T>,
    methodName: string,
    action: string
): Promise<T> => {
    try {
        return await execute()
    } catch (e: any) {
        const suffixes = without(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            ['reason', 'code'].map((field) => (e[field] !== undefined ? `${field}=${e[field]}` : undefined)),
            undefined
        )
        const wrappedError = new Error(
            `Error while ${action} contract call "${methodName}"${(suffixes.length > 0) ? ', ' + suffixes.join(', ') : ''}`
        )
        // @ts-expect-error unknown property
        wrappedError.reason = e
        throw wrappedError
    }
}

const createWrappedContractMethod = (
    contract: Contract,
    contractName: string,
    methodName: string,
    eventEmitter: EventEmitter<ContractEvent>,
    concurrencyLimit: pLimit.Limit
) => {
    const originalMethod = contract[methodName]
    const methodFullName = `${contractName}.${methodName}`
    const fn = async (...args: any) => {
        const returnValue = await withErrorHandling(() => concurrencyLimit(() => {
            eventEmitter.emit('onMethodExecute', methodFullName)
            return originalMethod(...args)
        }), methodFullName, 'executing')
        if (isTransactionResponse(returnValue)) {
            eventEmitter.emit('onTransactionSubmit', methodFullName, returnValue)
            const originalWait = returnValue.wait.bind(returnValue)
            returnValue.wait = async (confirmations?: number, timeout?: number): Promise<null | ContractTransactionReceipt> => {
                const receipt = await withErrorHandling(() => originalWait(confirmations, timeout), methodName, 'waiting transaction for')
                eventEmitter.emit('onTransactionConfirm', methodFullName, receipt)
                return receipt
            }
        }
        return returnValue
    }
    // TODO add also other methods in the future if needed:
    // https://docs.ethers.org/v6/api/contract/#BaseContractMethod
    fn.estimateGas = (...args: any) => originalMethod.estimateGas(...args)
    return fn
}

/**
 * Adds error handling, logging and limits concurrency.
 *
 * You can use the decorated contract normally, e.g.:
 *     const tx = await contract.createFoobar(123)
 *     return await tx.wait()
 * or
 *     await contract.getFoobar(456)
 */
export const createDecoratedContract = <T extends BaseContract>(
    contract: Contract,
    contractName: string,
    loggerFactory: LoggerFactory,
    maxConcurrentCalls: number
): ObservableContract<T> => {
    const eventEmitter = new EventEmitter<ContractEvent>()
    const concurrencyLimit = pLimit(maxConcurrentCalls)
    const decoratedContract: any = {
        eventEmitter,
        getAddress: () => contract.getAddress(),
        // TODO implement also other generic contract methods in the future if needed
        on: (eventName: string, listener: (...args: any[]) => void) => {
            contract.on(eventName, listener)
        },
        off: (eventName: string, listener: (...args: any[]) => void) => {
            contract.off(eventName, listener)
        }
    }
    /*
     * Wrap each contract function. We read the list of functions from contract.functions, but
     * actually delegate each method to contract[methodName]. Those methods are almost identical
     * to contract.functions[methodName] methods. The major difference is the way of handling
     * single-value results: the return type of contract.functions[methodName] is always
     * Promise<Result> (see https://docs.ethers.org/v6/api/contract/#BaseContract)
     */
    const methodNames = contract.interface.fragments.filter((f) => FunctionFragment.isFunction(f)).map((f) => f.name)
    methodNames.forEach((methodName) => {
        decoratedContract[methodName] = createWrappedContractMethod(
            contract,
            contractName,
            methodName,
            eventEmitter,
            concurrencyLimit
        )
    })

    createLogger(eventEmitter, loggerFactory)

    return decoratedContract
}

export const initContractEventGateway = <
    TSourcePayloads extends any[],
    TTarget extends Events<TTarget>,
    TTargetName extends keyof TTarget
>(opts: {
    sourceDefinition: Omit<EventListenerDefinition, 'onEvent'>
    targetName: TTargetName
    sourceEmitter: ChainEventPoller
    targetEmitter: ObservableEventEmitter<TTarget>
    transformation: (...args: TSourcePayloads) => Parameters<TTarget[TTargetName]>[0]
    loggerFactory: LoggerFactory
}): void => {
    const logger = opts.loggerFactory.createLogger(module)
    type Listener = (...args: TSourcePayloads) => void
    initEventGateway(
        opts.targetName,
        (emit: (payload: Parameters<TTarget[TTargetName]>[0]) => void) => {
            const listener = (...args: TSourcePayloads) => {
                let targetEvent
                try {
                    targetEvent = opts.transformation(...args)
                } catch (err) {
                    logger.error('Skip emit event', {
                        eventName: opts.targetName,
                        reason: err?.message
                    })
                    return
                }
                emit(targetEvent)
            }
            opts.sourceEmitter.on({
                onEvent: listener,
                ...opts.sourceDefinition
            })
            return listener
        },
        (listener: Listener) => {
            opts.sourceEmitter.off({
                onEvent: listener,
                ...opts.sourceDefinition
            })
        },
        opts.targetEmitter
    )
}
