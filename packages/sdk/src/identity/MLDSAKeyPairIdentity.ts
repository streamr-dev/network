import { hexToBinary, ML_DSA_87 } from '@streamr/utils'
import { KeyPairIdentity } from './KeyPairIdentity'
import { SignatureType } from '@streamr/trackerless-network'
import { StrictStreamrClientConfig } from '../Config'
import { ValidKeyTypeConfig } from './createIdentityFromConfig'

/**
 * An identity that uses a quantum-resistant ML-DSA-87 key pair to sign messages.
 */
export class MLDSAKeyPairIdentity extends KeyPairIdentity {
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

    // eslint-disable-next-line class-methods-use-this
    getSignatureTypeAsString(): ValidKeyTypeConfig {
        return 'ml-dsa-87'
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

}
