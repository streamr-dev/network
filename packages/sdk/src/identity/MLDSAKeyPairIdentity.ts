import { hexToBinary, ML_DSA_87 } from '@streamr/utils'
import { KeyPairIdentity } from './KeyPairIdentity'
import { SignatureType } from '@streamr/trackerless-network'
import { StrictStreamrClientConfig } from '../Config'

/**
 * An identity that uses a quantum-resistant ML-DSA-87 key pair to sign messages.
 */
export class MLDSAKeyPairIdentity extends KeyPairIdentity {
    assertKeyPairIsValid(): void {
        // Validity of key pair is tested by signing and validating something
        const payload = Buffer.from('data-to-sign')
        const signature = ML_DSA_87.createSignature(payload, this.privateKey)
        if (!ML_DSA_87.verifySignature(this.publicKey, payload, signature)) {
            throw new Error(`The given publicKey and privateKey don't seem to match!`)
        }
    }

    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.ML_DSA_87
    }

    // eslint-disable-next-line class-methods-use-this
    getExpectedPublicKeyLength(): number {
        return 2592
    }

    // eslint-disable-next-line class-methods-use-this
    getExpectedPrivateKeyLength(): number {
        return 4896
    }

    async createMessageSignature(payload: Uint8Array): Promise<Uint8Array> {
        return ML_DSA_87.createSignature(payload, this.privateKey)
    }

    static fromConfig(config: Pick<StrictStreamrClientConfig, 'auth'>): MLDSAKeyPairIdentity {
        const keyPairConfig = KeyPairIdentity.getKeyPairFromConfig(config)
        if (!keyPairConfig.publicKey) {
            throw new Error(`ML-DSA identity requires a publicKey to be given in the config!`)
        }
        return new MLDSAKeyPairIdentity(hexToBinary(keyPairConfig.publicKey), hexToBinary(keyPairConfig.privateKey))
    }

    static generate(): MLDSAKeyPairIdentity {
        const keyPair = ML_DSA_87.generateKeyPair()
        return new MLDSAKeyPairIdentity(keyPair.publicKey, keyPair.privateKey)
    }

}
