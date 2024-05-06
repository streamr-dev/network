import {
    BaseContract,
    Contract,
    ContractTransactionReceipt,
    ContractTransactionResponse,
} from 'ethers'
import { initEventGateway } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import shuffle from 'lodash/shuffle'
import without from 'lodash/without'
import pLimit from 'p-limit'
import { InternalEvents, StreamrClientEventEmitter, StreamrClientEvents } from '../events'
import { LoggerFactory } from './LoggerFactory'
import { tryInSequence } from './promises'
import { FunctionFragment } from 'ethers'
import type { TransactionResponse } from 'ethers'

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
            events: (receipt?.logs || []).map((e) => e)
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
            ['reason', 'code'].map((field) => (e[field] !== undefined ? `${field}=${e[field]}` : undefined)),
            undefined
        )
        const wrappedError = new Error(
            `Error while ${action} contract call "${methodName}"${(suffixes.length > 0) ? ', ' + suffixes.join(', ') : ''}`
        )
        console.log(e)  // TODO remove
        // @ts-expect-error unknown property
        wrappedError.reason = e
        throw wrappedError
    }
}

const createWrappedContractMethod = (
    originalMethod: (...args: any) => Promise<any>,
    methodName: string,
    eventEmitter: EventEmitter<ContractEvent>,
    concurrencyLimit: pLimit.Limit
) => {
    return async (...args: any) => {
        const returnValue = await withErrorHandling(() => concurrencyLimit(() => {
            eventEmitter.emit('onMethodExecute', methodName)
            return originalMethod(...args)
        }), methodName, 'executing')
        if (isTransactionResponse(returnValue)) {
            eventEmitter.emit('onTransactionSubmit', methodName, returnValue)
            return {
                ...returnValue,
                wait: async (confirmations?: number, timeout?: number): Promise<null | ContractTransactionReceipt> => {
                    const receipt = await withErrorHandling(() => returnValue.wait(confirmations, timeout), methodName, 'waiting transaction for')
                    eventEmitter.emit('onTransactionConfirm', methodName, receipt)
                    return receipt
                }
            }
        } else {
            return returnValue
        }
    }
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
    let decoratedContract: any = {
        eventEmitter
    }
    /*
     * Wrap each contract function. We read the list of functions from contract.functions, but
     * actually delegate each method to contract[methodName]. Those methods are almost identical
     * to contract.functions[methodName] methods. The major difference is the way of handling
     * single-value results: the return type of contract.functions[methodName] is always
     * Promise<Result> (see https://docs.ethers.io/v5/api/contract/contract/#Contract--readonly)
     */
    const methodNames = contract['interface'].fragments.filter((f) => FunctionFragment.isFunction(f)).map((f) => (f as FunctionFragment).name)
    methodNames.forEach((methodName) => {
        decoratedContract[methodName] = createWrappedContractMethod(
            contract[methodName],
            `${contractName}.${methodName}`,
            eventEmitter,
            concurrencyLimit
        )
    })

    createLogger(eventEmitter, loggerFactory)

    /*TODO re-enable function getAllPropertyNames(obj: object): string[] {
        const proto = Object.getPrototypeOf(obj)
        const inherited = (proto) ? getAllPropertyNames(proto) : []
        return [...new Set(Object.getOwnPropertyNames(obj).concat(inherited))]
    }

    // copy own properties and inherited properties (e.g. contract.removeAllListeners)
    // eslint-disable-next-line no-prototype-builtins
    for (const key of getAllPropertyNames(contract)) {
        result[key] = methods[key] !== undefined ? methods[key] : contract[key]
    }*/
    return decoratedContract
}

export const queryAllReadonlyContracts = <T, C>(
    call: (contract: C) => Promise<T>,
    contracts: C[]
): Promise<T> => {
    return tryInSequence(
        shuffle(contracts).map((contract: C) => {
            return () => call(contract)
        })
    )
}

export const initContractEventGateway = <
    TSourcePayloads extends any[],
    TSourceName extends string,
    TTargetName extends keyof (StreamrClientEvents & InternalEvents)
>(opts: {
    sourceName: TSourceName
    targetName: TTargetName
    sourceEmitter: {
        on: (name: TSourceName, listener: (...args: TSourcePayloads) => void) => void
        off: (name: TSourceName, listener: (...args: TSourcePayloads) => void) => void
    }
    targetEmitter: StreamrClientEventEmitter
    transformation: (...args: TSourcePayloads) => Parameters<(StreamrClientEvents & InternalEvents)[TTargetName]>[0]
    loggerFactory: LoggerFactory
}): void => {
    const logger = opts.loggerFactory.createLogger(module)
    type Listener = (...args: TSourcePayloads) => void
    initEventGateway(
        opts.targetName,
        (emit: (payload: Parameters<(StreamrClientEvents & InternalEvents)[TTargetName]>[0]) => void) => {
            const listener = (...args: TSourcePayloads) => {
                let targetEvent
                try {
                    targetEvent = opts.transformation(...args)
                } catch (err) {
                    logger.debug('Skip emit event', {
                        eventName: opts.targetName,
                        reason: err?.message
                    })
                    return
                }
                emit(targetEvent)
            }
            opts.sourceEmitter.on(opts.sourceName, listener)
            return listener
        },
        (listener: Listener) => {
            opts.sourceEmitter.off(opts.sourceName, listener)
        },
        opts.targetEmitter
    )
}
