import { ML_DSA_87 } from '@streamr/utils'
import { KeyPairIdentity } from './KeyPairIdentity'

export class ML_DSA_Identity extends KeyPairIdentity {

    async createMessageSignature(payload: Uint8Array): Promise<Uint8Array> {
        return ML_DSA_87.createSignature(payload, this.privateKey)
    }

}
