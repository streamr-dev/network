import { hexToBinary, ML_DSA_87 } from '@streamr/utils'
import { KeyPairIdentity } from './KeyPairIdentity'
import { SignatureType } from '@streamr/trackerless-network'
import { StrictStreamrClientConfig } from '../Config'

/**
 * An identity that uses a quantum-resistant ML-DSA-87 key pair to sign messages.
 */
export class MLDSAKeyPairIdentity extends KeyPairIdentity {

    assertValidKeyPair(): void {
        ML_DSA_87.assertValidKeyPair(this.publicKey, this.privateKey)
    }

    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.ML_DSA_87
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

    static async generate(): Promise<MLDSAKeyPairIdentity> {
        const keyPair = await ML_DSA_87.generateKeyPair()
        return new MLDSAKeyPairIdentity(keyPair.publicKey, keyPair.privateKey)
    }

}
