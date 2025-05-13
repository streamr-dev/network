import { binaryToHex, MlDsa87, UserIDRaw } from '@streamr/utils'
import { MLDSAKeyPairIdentity } from '../../src/identity/MLDSAKeyPairIdentity'

const signingUtil = new MlDsa87()

describe('MLDSAKeyPairIdentity', () => {

    describe('fromConfig', () => {
        it('can be created without 0x prefix on public and private key', async () => {
            const keyPair = signingUtil.generateKeyPair()
        
            expect(() => MLDSAKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: binaryToHex(keyPair.publicKey),
                    privateKey: binaryToHex(keyPair.privateKey),
                }
            })).not.toThrow()
        })
        it('can be created with 0x prefix on public and private key', async () => {
            const keyPair = signingUtil.generateKeyPair()
        
            expect(() => MLDSAKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: binaryToHex(keyPair.publicKey, true),
                    privateKey: binaryToHex(keyPair.privateKey, true),
                }
            })).not.toThrow()
        })
        it('throws if the given publicKey does not match the publicKey', async () => {
            const keyPair = signingUtil.generateKeyPair()

            expect(() => MLDSAKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: binaryToHex(keyPair.publicKey).replace('b', 'd'),
                    privateKey: binaryToHex(keyPair.privateKey),
                }
            })).toThrow()
        })
    })

    describe('createMessageSignature', () => {

        it('creates correct signatures', async () => {
            const payload = Buffer.from('data-to-sign')
            const keyPair = signingUtil.generateKeyPair()

            const identity = new MLDSAKeyPairIdentity(keyPair.publicKey, keyPair.privateKey)
            const signature = await identity.createMessageSignature(payload)
            expect(await signingUtil.verifySignature(keyPair.publicKey as UserIDRaw, payload, signature)).toBe(true)
        })
    })
})
