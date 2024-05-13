import { TransactionRequest, TransactionResponse, Wallet } from 'ethers'

/**
 * Wallet that automatically increments nonce locally for each transaction.
 * This fixes the issue of locally sending another transaction before the previous one gets into the chain.
 *   (locally, both tx would receive the same `getTransactionCount` from RPC and hence have nonce conflict)
 *
 * Local nonce bookkeeping could cause a conflict with another client running elsewhere using the same private key.
 * To avoid this type of conflict (over a longer period of time), we mostly do the default thing:
 *   ask from RPC what the nonce should be (getTransactionCount).
 * However, we don't need to ask every time if transactions are being sent rapidly,
 *   because the first possible time it can change is when the next block comes out.
 * Easiest place to reset the locally cached nonce is when the first transaction gets into the chain:
 *   this we can know by hooking into the wait() method of the transaction response,
 *   with the assumption that (at least one) of rapidly sent transactions calls the wait().
 *
 * This system works if only one of the clients sharing the private key sends out transactions at any given time.
 *   In case many clients try to use the same private key at the same time,
 *   they need some other nonce coordination mechanism; this can not be provided by RPCs.
 */
export class AutoNonceWallet extends Wallet {
    private noncePromise: Promise<number> | null = null

    /**
     * Reset the cached nonce when the first transaction gets into the chain
     * This is a conservative reset because after block is published is the first possible time
     *   that this client can interact (via RPC/chain) with another client running elsewhere using the same wallet
     */
    onTransactionConfirm(): void {
        this.noncePromise = null
    }

    override async sendTransaction(transaction: TransactionRequest): Promise<TransactionResponse> {
        if (!this.provider) { throw new Error('Unexpected: Wallet created without provider') }
        if (transaction.nonce == null) {
            const noncePromise = this.noncePromise ?? this.provider.getTransactionCount(this.address)
            this.noncePromise = noncePromise.then((nonce) => (nonce + 1))
            // eslint-disable-next-line require-atomic-updates -- we're not expecting same transaction object to enter many function calls
            transaction.nonce = await noncePromise
        }
        return super.sendTransaction(transaction)
    }
}
