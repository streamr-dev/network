import { binaryToHex, toUserId, UserID } from '@streamr/utils'
import { RpcProviderSource } from '../RpcProviderSource'
import { Identity, SignerWithProvider } from './Identity'

export abstract class KeyPairIdentity extends Identity {
    publicKey: Uint8Array
    privateKey: Uint8Array
    private cachedUserId: UserID | undefined

    constructor(publicKey: Uint8Array, privateKey: Uint8Array) {
        super()
        this.publicKey = publicKey
        this.privateKey = privateKey
    }

    async getUserId(): Promise<UserID> { 
        if (!this.cachedUserId) {
            this.cachedUserId = toUserId(binaryToHex(this.publicKey))
        }
        return this.cachedUserId
    }

    // eslint-disable-next-line class-methods-use-this
    async getTransactionSigner(_rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider> {
        throw new Error('ML-DSA identities can not sign transactions!')
    }
}
