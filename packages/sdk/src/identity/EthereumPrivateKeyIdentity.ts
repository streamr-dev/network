import { Identity, SignerWithProvider } from './Identity'
import { EVM_SECP256K1, hexToBinary, toUserId, UserID } from '@streamr/utils'
import { computeAddress, Wallet } from 'ethers'
import { RpcProviderSource } from '../RpcProviderSource'

export class EthereumPrivateKeyIdentity extends Identity {
    private userId: UserID
    private privateKey: Uint8Array
    private privateKeyAsString: string

    constructor(privateKey: string) {
        super()
        this.userId = toUserId(computeAddress(privateKey))
        this.privateKeyAsString = privateKey
        this.privateKey = hexToBinary(privateKey)
    }

    async getUserId(): Promise<UserID> { 
        return this.userId
    }

    async createMessageSignature(payload: Uint8Array): Promise<Uint8Array> {
        return EVM_SECP256K1.createSignature(payload, this.privateKey)
    }

    async getTransactionSigner(rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider> {
        const primaryProvider = rpcProviderSource.getProvider()
        return new Wallet(this.privateKeyAsString, primaryProvider) as SignerWithProvider
    }
}
