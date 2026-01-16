import { hexToBinary, SigningUtil } from '@streamr/utils'
import { KeyPairIdentity } from './KeyPairIdentity'
import { SignatureType } from '@streamr/trackerless-network'
import type { StrictStreamrClientConfig } from '../ConfigTypes'

const signingUtil = SigningUtil.getInstance('ML_DSA_87')

/**
 * An identity that uses a quantum-resistant ML-DSA-87 key pair to sign messages.
 */
export class MLDSAKeyPairIdentity extends KeyPairIdentity {

    assertValidKeyPair(): void {
        signingUtil.assertValidKeyPair(this.publicKey, this.privateKey)
    }

    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.ML_DSA_87
    }

    async createMessageSignature(payload: Uint8Array): Promise<Uint8Array> {
        return signingUtil.createSignature(payload, this.privateKey)
    }

    /** @internal */
    static fromConfig(config: Pick<StrictStreamrClientConfig, 'auth'>): MLDSAKeyPairIdentity {
        const keyPairConfig = KeyPairIdentity.getKeyPairFromConfig(config)
        if (!keyPairConfig.publicKey) {
            throw new Error(`ML-DSA identity requires a publicKey to be given in the config!`)
        }
        return new MLDSAKeyPairIdentity(hexToBinary(keyPairConfig.publicKey), hexToBinary(keyPairConfig.privateKey))
    }

    static generate(): MLDSAKeyPairIdentity {
        const keyPair = signingUtil.generateKeyPair()
        return new MLDSAKeyPairIdentity(keyPair.publicKey, keyPair.privateKey)
    }

}
