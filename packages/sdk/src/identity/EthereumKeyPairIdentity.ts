import { SignerWithProvider } from './Identity'
import { binaryToHex, ECDSA_SECP256K1_EVM, HexString, hexToBinary } from '@streamr/utils'
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

    assertValidKeyPair(): void {
        ECDSA_SECP256K1_EVM.assertValidKeyPair(this.publicKey, this.privateKey)
    }
    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.ECDSA_SECP256K1_EVM
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
        return ECDSA_SECP256K1_EVM.createSignature(payload, this.privateKey)
    }

    async getTransactionSigner(rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider> {
        const primaryProvider = rpcProviderSource.getProvider()
        return new Wallet(binaryToHex(this.privateKey), primaryProvider) as SignerWithProvider
    }

    static fromConfig(config: Pick<StrictStreamrClientConfig, 'auth'>): EthereumKeyPairIdentity {
        const privateKey = (config.auth as KeyPairIdentityConfig).privateKey
        const address = (config.auth as KeyPairIdentityConfig).publicKey
        return EthereumKeyPairIdentity.fromPrivateKey(privateKey, address)
    }

    static fromPrivateKey(privateKey: HexString, address?: HexString): EthereumKeyPairIdentity {
        return new EthereumKeyPairIdentity(
            hexToBinary(address ?? new Wallet(privateKey).address.toLowerCase()), 
            hexToBinary(privateKey)
        )
    }

    static async generate(): Promise<EthereumKeyPairIdentity> {
        // Only sync generation available, wrap in promise
        return EthereumKeyPairIdentity.generateSync()
    }

    static generateSync(): EthereumKeyPairIdentity {
        const wallet = Wallet.createRandom()
        return EthereumKeyPairIdentity.fromPrivateKey(wallet.privateKey, wallet.address)
    }
}
