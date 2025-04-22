import { SignerWithProvider } from './Identity'
import { binaryToHex, EVM_SECP256K1, hexToBinary } from '@streamr/utils'
import { Wallet } from 'ethers'
import { RpcProviderSource } from '../RpcProviderSource'
import { SignatureType } from '@streamr/trackerless-network'
import { KeyPairIdentityConfig, StrictStreamrClientConfig } from '../Config'
import { KeyPairIdentity } from './KeyPairIdentity'

/**
 * An Identity that derives an Ethereum address from a secp256k1 private key
 * and uses that as the UserID instead of the actual public key.
 */
export class EthereumKeyPairIdentity extends KeyPairIdentity {
    constructor(privateKey: string, address?: string) {
        const impliedAddress = new Wallet(privateKey).address.toLowerCase()
        super(
            hexToBinary(impliedAddress), 
            hexToBinary(privateKey)
        )
        if (address && address.toLowerCase() !== impliedAddress) {
            throw new Error(`The given publicKey does not match the privateKey! The privateKey implies address: ${impliedAddress}`)
        }
    }

    // eslint-disable-next-line class-methods-use-this
    assertKeyPairIsValid(): void {
        // Ensured by constructor
    }

    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.EVM_SECP256K1
    }

    // eslint-disable-next-line class-methods-use-this
    getExpectedPublicKeyLength(): number {
        // Address, not actual public key
        return 20
    }

    // eslint-disable-next-line class-methods-use-this
    getExpectedPrivateKeyLength(): number {
        return 32
    }

    async createMessageSignature(payload: Uint8Array): Promise<Uint8Array> {
        return EVM_SECP256K1.createSignature(payload, this.privateKey)
    }

    async getTransactionSigner(rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider> {
        const primaryProvider = rpcProviderSource.getProvider()
        return new Wallet(binaryToHex(this.privateKey), primaryProvider) as SignerWithProvider
    }

    static fromConfig(config: Pick<StrictStreamrClientConfig, 'auth'>): EthereumKeyPairIdentity {
        const privateKey = (config.auth as KeyPairIdentityConfig).privateKey
        const address = (config.auth as KeyPairIdentityConfig).publicKey
        return new EthereumKeyPairIdentity(privateKey, address)
    }

    static generate(): EthereumKeyPairIdentity {
        const wallet = Wallet.createRandom()
        return new EthereumKeyPairIdentity(wallet.privateKey)
    }
}
