import { initEventGateway } from '@streamr/utils'
import { Contract, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import EventEmitter from 'eventemitter3'
import { NameDirectory } from '@streamr/network-node'
import pLimit from 'p-limit'
import { LoggerFactory } from './LoggerFactory'
import { tryInSequence } from './promises'
import shuffle from 'lodash/shuffle'
import { StreamrClientEventEmitter, InternalEvents, StreamrClientEvents } from '../events'

export interface ContractEvent {
    onMethodExecute: (methodName: string) => void
    onTransactionSubmit: (methodName: string, tx: ContractTransaction) => void
    onTransactionConfirm: (methodName: string, tx: ContractTransaction, receipt: ContractReceipt) => void
}

export type ObservableContract<T extends Contract> = T & {
    eventEmitter: EventEmitter<ContractEvent>
}

export async function waitForTx(
    txToSubmit: Promise<ContractTransaction>
): Promise<ContractReceipt> {
    const tx = await txToSubmit
    return tx.wait()
}

const isTransaction = (returnValue: any): returnValue is ContractTransaction => {
    return (returnValue.wait !== undefined && (typeof returnValue.wait === 'function'))
}

const createLogger = (eventEmitter: EventEmitter<ContractEvent>, loggerFactory: LoggerFactory): void => {
    const logger = loggerFactory.createLogger(module)
    eventEmitter.on('onMethodExecute', (methodName: string) => {
        logger.debug('Execute method', { methodName })
    })
    eventEmitter.on('onTransactionSubmit', (methodName: string, tx: ContractTransaction) => {
        logger.debug('Submit transaction', {
            method: methodName,
            tx: tx.hash,
            to: NameDirectory.getName(tx.to),
            nonce: tx.nonce,
            gasLimit: tx.gasLimit.toNumber(),
            gasPrice: tx.gasPrice?.toNumber()
        })
    })
    eventEmitter.on('onTransactionConfirm', (methodName: string, tx: ContractTransaction, receipt: ContractReceipt) => {
        logger.debug('Received transaction confirmation', {
            method: methodName,
            tx: tx.hash,
            block: receipt.blockNumber,
            confirmations: receipt.confirmations,
            gasUsed: receipt.gasUsed.toNumber(),
            events: (receipt.events || []).map((e) => e.event)
        })
    })
}

const withErrorHandling = async <T>(
    execute: () => Promise<T>,
    methodName: string
): Promise<T> => {
    try {
        return await execute()
    } catch (e: any) {
        const wrappedError = new Error(`Error in contract call "${methodName}"`)
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
        }), methodName)
        if (isTransaction(returnValue)) {
            const tx = returnValue
            const originalWaitMethod = tx.wait
            tx.wait = async (confirmations?: number): Promise<ContractReceipt> => {
                const receipt = await withErrorHandling(() => originalWaitMethod(confirmations), `${methodName}.wait`)
                eventEmitter.emit('onTransactionConfirm', methodName, tx, receipt)
                return receipt
            }
            eventEmitter.emit('onTransactionSubmit', methodName, tx)
        }
        return returnValue
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
export const createDecoratedContract = <T extends Contract>(
    contract: Contract,
    contractName: string,
    loggerFactory: LoggerFactory,
    maxConcurrentCalls: number
): ObservableContract<T> => {
    const eventEmitter = new EventEmitter<ContractEvent>()
    const methods: Record<string, () => Promise<any>> = {}
    const concurrencyLimit = pLimit(maxConcurrentCalls)
    /*
     * Wrap each contract function. We read the list of functions from contract.functions, but
     * actually delegate each method to contract[methodName]. Those methods are almost identical
     * to contract.functions[methodName] methods. The major difference is the way of handling
     * single-value results: the return type of contract.functions[methodName] is always
     * Promise<Result> (see https://docs.ethers.io/v5/api/contract/contract/#Contract--readonly)
     */
    Object.keys(contract.functions).forEach((methodName) => {
        methods[methodName] = createWrappedContractMethod(
            contract[methodName],
            `${contractName}.${methodName}`,
            eventEmitter,
            concurrencyLimit
        )
    })
    createLogger(eventEmitter, loggerFactory)
    const result: any = {
        eventEmitter
    }
    // copy own properties and inherited properties (e.g. contract.removeAllListeners)
    for (const key in contract) {
        result[key] = methods[key] !== undefined ? methods[key] : contract[key]
    }
    return result
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
