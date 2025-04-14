import { ML_DSA_87 } from '@streamr/utils'
import { KeyPairIdentity } from './KeyPairIdentity'
import { SignatureType } from '@streamr/trackerless-network'

export class MLDSAKeyPairIdentity extends KeyPairIdentity {

    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.ML_DSA_87
    }

    async createMessageSignature(payload: Uint8Array): Promise<Uint8Array> {
        return ML_DSA_87.createSignature(payload, this.privateKey)
    }

}
