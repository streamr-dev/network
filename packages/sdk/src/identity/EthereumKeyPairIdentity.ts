import { SignerWithProvider } from './Identity'
import { binaryToHex, EVM_SECP256K1, hexToBinary } from '@streamr/utils'
import { computeAddress, Wallet } from 'ethers'
import { RpcProviderSource } from '../RpcProviderSource'
import { SignatureType } from '@streamr/trackerless-network'
import { KeyPairIdentityConfig, StrictStreamrClientConfig } from '../Config'
import { KeyPairIdentity } from './KeyPairIdentity'

/**
 * An Identity that derives an Ethereum address from a secp256k1 private key
 * and uses that as the UserID instead of the actual public key.
 */
export class EthereumKeyPairIdentity extends KeyPairIdentity {

    constructor(privateKey: string) {
        super(hexToBinary(computeAddress(privateKey)), hexToBinary(privateKey))
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
        return new EthereumKeyPairIdentity(privateKey)
    }

    static generate(): EthereumKeyPairIdentity {
        const wallet = Wallet.createRandom()
        return new EthereumKeyPairIdentity(wallet.privateKey)
    }
}
