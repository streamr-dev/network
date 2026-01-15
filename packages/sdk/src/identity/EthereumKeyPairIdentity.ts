import { SignerWithProvider } from './Identity'
import { binaryToHex, EcdsaSecp256k1Evm, HexString, hexToBinary } from '@streamr/utils'
import { Wallet } from 'ethers'
import { RpcProviderSource } from '../RpcProviderSource'
import { SignatureType } from '@streamr/trackerless-network'
import { KeyPairIdentityConfig, StrictStreamrClientConfig } from '../ConfigTypes'
import { KeyPairIdentity } from './KeyPairIdentity'

const signingUtil = new EcdsaSecp256k1Evm()

/**
 * An Identity that derives an Ethereum address from a secp256k1 private key
 * and uses that as the UserID instead of the actual public key.
 */
export class EthereumKeyPairIdentity extends KeyPairIdentity {

    assertValidKeyPair(): void {
        signingUtil.assertValidKeyPair(this.publicKey, this.privateKey)
    }
    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.ECDSA_SECP256K1_EVM
    }

    async createMessageSignature(payload: Uint8Array): Promise<Uint8Array> {
        return signingUtil.createSignature(payload, this.privateKey)
    }

    override async getTransactionSigner(rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider> {
        const primaryProvider = rpcProviderSource.getProvider()
        return new Wallet(binaryToHex(this.privateKey), primaryProvider) as SignerWithProvider
    }

    /** @internal */
    static fromConfig(config: Pick<StrictStreamrClientConfig, 'auth'>): EthereumKeyPairIdentity {
        const privateKey = (config.auth as KeyPairIdentityConfig).privateKey
        const address = (config.auth as KeyPairIdentityConfig).publicKey
        return EthereumKeyPairIdentity.fromPrivateKey(privateKey, address)
    }

    static fromPrivateKey(privateKey: HexString, address?: HexString): EthereumKeyPairIdentity {
        return new EthereumKeyPairIdentity(
            hexToBinary(address ?? new Wallet(privateKey).address), 
            hexToBinary(privateKey)
        )
    }

    static generate(): EthereumKeyPairIdentity {
        const keyPair = signingUtil.generateKeyPair()
        return new EthereumKeyPairIdentity(keyPair.publicKey, keyPair.privateKey)
    }
}
