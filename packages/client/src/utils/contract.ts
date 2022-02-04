import { Contract, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import debug from 'debug'

const log = debug('Streamr:contract')

interface ContractLogger {
    onMethodExecute: (methodName: string) => void,
    onTransactionSubmit: (methodName: string, tx: ContractTransaction) => void,
    onTransactionConfirm: (methodName: string, tx: ContractTransaction, receipt: ContractReceipt) => void
}

export async function waitForTx(
    txToSubmit: Promise<ContractTransaction>
): Promise<ContractReceipt> {
    const tx = await txToSubmit
    return tx.wait()
}

function shortenAddress(address: string | undefined): string | undefined {
    return address !== undefined ? `${address.slice(0, 5)}...${address.slice(-4)}` : undefined
}

const isTransaction = (returnValue: any): returnValue is ContractTransaction => {
    return (returnValue.wait !== undefined && (typeof returnValue.wait === 'function'))
}

const createLogger = (): ContractLogger => {
    return {
        onMethodExecute: (methodName: string) => {
            log(`execute ${methodName}`)
        },
        onTransactionSubmit: (methodName: string, tx: ContractTransaction) => {
            log(
                'transaction submitted { method=%s, tx=%s, to=%s, nonce=%d, gasLimit=%d, gasPrice=%d }',
                methodName,
                tx.hash,
                shortenAddress(tx.to),
                tx.nonce,
                tx.gasLimit,
                tx.gasPrice
            )
        },
        onTransactionConfirm: (methodName: string, tx: ContractTransaction, receipt: ContractReceipt) => {
            log(
                'transaction confirmed { method=%s, tx=%s, block=%d, confirmations=%d, gasUsed=%d, events=%j }',
                methodName,
                tx.hash,
                receipt.blockNumber,
                receipt.confirmations,
                receipt.gasUsed,
                (receipt.events || []).map((e) => e.event)
            )
        }
    }
}

const withErrorHandling = async <T>(
    execute: () => Promise<T>,
    methodName: string
): Promise<T> | never => {
    try {
        return await execute()
    } catch (e: any) {
        const wrappedError = new Error(`Error in contract call "${methodName}"`)
        // @ts-expect-error
        wrappedError.reason = e
        throw wrappedError
    }
}

const createWrappedContractMethod = (
    originalMethod: (...args: any) => Promise<any>,
    methodName: string,
    logger: ContractLogger,
) => {
    return async (...args: any) => {
        logger.onMethodExecute(methodName)
        const returnValue = await withErrorHandling(() => originalMethod(...args), methodName)
        if (isTransaction(returnValue)) {
            const tx = returnValue
            const originalWaitMethod = tx.wait
            tx.wait = async (confirmations?: number): Promise<ContractReceipt> => {
                const receipt = await withErrorHandling(() => originalWaitMethod(confirmations), `${methodName}.wait`)
                logger.onTransactionConfirm(methodName, tx, receipt)
                return receipt
            }
            logger.onTransactionSubmit(methodName, tx)
        }
        return returnValue
    }
}

/**
 * You can use the wrapped contract normally, e.g.:
 *     const tx = await contract.createFoobar(123)
 *     return await tx.wait()
 * or
 *     await contract.getFoobar(456)
 */
export const withErrorHandlingAndLogging = (
    contract: Contract,
    contractName: string,
): Contract => {
    const methods: Record<string, () => Promise<any>> = {}
    Object.keys(contract.functions).forEach((key) => {
        methods[key] = createWrappedContractMethod(
            contract.functions[key],
            `${contractName}.${key}`,
            createLogger()
        )
    })
    const clone: any = {}
    // copy own properties and inherited properties (e.g. contract.removeAllListeners)
    // eslint-disable-next-line
    for (const key in contract) {
        clone[key] = methods[key] !== undefined ? methods[key] : contract[key]
    }
    return clone
}
