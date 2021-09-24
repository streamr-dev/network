import { BytesLike } from '@ethersproject/bytes'
import { Deferrable } from '@ethersproject/properties'
import { Provider, TransactionRequest } from '@ethersproject/providers'
import { Wallet } from '@ethersproject/wallet'

export class AutoNonceWallet extends Wallet {
    private _noncePromise: Promise<number> | null

    constructor(privateKey: BytesLike, provider?: Provider) {
        super(privateKey, provider)
        this._noncePromise = null
    }

    sendTransaction(transaction: Deferrable<TransactionRequest>) {
        if (transaction.nonce == null) {
            if (this._noncePromise == null) {
                this._noncePromise = this.provider.getTransactionCount(this.address)
            }
            transaction.nonce = this._noncePromise // eslint-disable-line no-param-reassign
            this._noncePromise = this._noncePromise.then((nonce) => (nonce + 1))
        }
        return super.sendTransaction(transaction)
    }
}
