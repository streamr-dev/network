import { binaryToHex, EcdsaSecp256r1 } from '@streamr/utils'
import { ECDSAKeyPairIdentity } from '../../src/identity/ECDSAKeyPairIdentity'

const signingUtil = new EcdsaSecp256r1()

describe('ECDSAKeyPairIdentity', () => {

    describe('fromConfig', () => {
        it('can be created without 0x prefix on public and private key', async () => {
            const keyPair = signingUtil.generateKeyPair()
        
            ECDSAKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: binaryToHex(keyPair.publicKey),
                    privateKey: binaryToHex(keyPair.privateKey),
                }
            })
        })
        it('can be created with 0x prefix on public and private key', async () => {
            const keyPair = signingUtil.generateKeyPair()
        
            ECDSAKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: binaryToHex(keyPair.publicKey, true),
                    privateKey: binaryToHex(keyPair.privateKey, true),
                }
            })
        })
        it('throws if the given publicKey does not match the publicKey', async () => {
            const keyPair = signingUtil.generateKeyPair()
            const wrongPublicKey = new Uint8Array(keyPair.publicKey.length)

            expect(() => ECDSAKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: binaryToHex(wrongPublicKey),
                    privateKey: binaryToHex(keyPair.privateKey),
                }
            })).toThrow()
        })
    })

    describe('createMessageSignature', () => {

        it('creates correct signatures', async () => {
            const payload = Buffer.from('data-to-sign')
            const identity = ECDSAKeyPairIdentity.generate()
            const signature = await identity.createMessageSignature(payload)
            expect(await signingUtil.verifySignature(await identity.getUserIdRaw(), payload, signature)).toBe(true)
        })
    })
})
