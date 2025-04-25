import { hexToBinary, ECDSA_SECP256R1 } from '@streamr/utils'
import { KeyPairIdentity } from './KeyPairIdentity'
import { SignatureType } from '@streamr/trackerless-network'
import { StrictStreamrClientConfig } from '../Config'

/**
 * An identity that uses ECDSA on the SECP256R1 curve
 */
export class ECDSAKeyPairIdentity extends KeyPairIdentity {

    assertValidKeyPair(): void {
        ECDSA_SECP256R1.assertValidKeyPair(this.publicKey, this.privateKey)
    }

    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.ML_DSA_87
    }

    // eslint-disable-next-line class-methods-use-this
    getExpectedPublicKeyLength(): number {
        return 65 // format: uncompressed raw
    }

    // eslint-disable-next-line class-methods-use-this
    getExpectedPrivateKeyLength(): number {
        return 138 // format: pkcs8
    }

    async createMessageSignature(payload: Uint8Array): Promise<Uint8Array> {
        return ECDSA_SECP256R1.createSignature(payload, this.privateKey)
    }

    static fromConfig(config: Pick<StrictStreamrClientConfig, 'auth'>): ECDSAKeyPairIdentity {
        const keyPairConfig = KeyPairIdentity.getKeyPairFromConfig(config)
        if (!keyPairConfig.publicKey) {
            throw new Error(`ECDSA_SECP256R1 identity requires a publicKey to be given in the config!`)
        }
        return new ECDSAKeyPairIdentity(hexToBinary(keyPairConfig.publicKey), hexToBinary(keyPairConfig.privateKey))
    }

    static async generate(): Promise<ECDSAKeyPairIdentity> {
        const keyPair = await ECDSA_SECP256R1.generateKeyPair()
        return new ECDSAKeyPairIdentity(keyPair.publicKey, keyPair.privateKey)
    }

}
