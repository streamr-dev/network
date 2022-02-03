import { ContractTransaction, ContractReceipt } from '@ethersproject/contracts'
import debug from 'debug'

const log = debug('Streamr:waitForTx')

function shortenAddress(address: string | undefined): string | undefined {
    return address !== undefined ? `${address.slice(0, 5)}...${address.slice(-4)}` : undefined
}

export async function waitForTx(
    txToSubmit: Promise<ContractTransaction>
): Promise<ContractReceipt> {
    const tx = await txToSubmit
    log(
        'transaction submitted { tx=%s, to=%s, nonce=%d, gasLimit=%d, gasPrice=%d }',
        tx.hash,
        shortenAddress(tx.to),
        tx.nonce,
        tx.gasLimit,
        tx.gasPrice
    )
    const receipt = await tx.wait()
    log(
        'transaction confirmed { tx=%s, block=%d, confirmations=%d, gasUsed=%d, events=%j }',
        tx.hash,
        receipt.blockNumber,
        receipt.confirmations,
        receipt.gasUsed,
        (receipt.events || []).map((e) => e.event)
    )
    return receipt
}
