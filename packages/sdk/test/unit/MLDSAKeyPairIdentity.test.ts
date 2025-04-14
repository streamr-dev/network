import { ML_DSA_87, UserIDRaw } from '@streamr/utils'
import { MLDSAKeyPairIdentity } from '../../src/identity/MLDSAKeyPairIdentity'

describe('EthereumPrivateKeyIdentity', () => {

    describe('createMessageSignature', () => {

        it('creates correct signatures', async () => {
            const payload = Buffer.from('data-to-sign')
            const keyPair = ML_DSA_87.generateKeyPair()

            const identity = new MLDSAKeyPairIdentity(keyPair.publicKey, keyPair.privateKey)
            const signature = await identity.createMessageSignature(payload)
            expect(ML_DSA_87.verifySignature(keyPair.publicKey as UserIDRaw, payload, signature)).toBe(true)
        })
    })
})
