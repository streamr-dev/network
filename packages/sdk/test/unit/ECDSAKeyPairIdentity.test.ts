import { binaryToHex, ECDSA_SECP256R1 } from '@streamr/utils'
import { ECDSAKeyPairIdentity } from '../../src/identity/ECDSAKeyPairIdentity'

describe('ECDSAKeyPairIdentity', () => {

    describe('fromConfig', () => {
        it('can be created without 0x prefix on public and private key', async () => {
            const keyPair = await ECDSA_SECP256R1.generateKeyPair()
        
            await ECDSAKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: binaryToHex(keyPair.publicKey),
                    privateKey: binaryToHex(keyPair.privateKey),
                }
            })
        })
        it('can be created with 0x prefix on public and private key', async () => {
            const keyPair = await ECDSA_SECP256R1.generateKeyPair()
        
            await ECDSAKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: binaryToHex(keyPair.publicKey, true),
                    privateKey: binaryToHex(keyPair.privateKey, true),
                }
            })
        })
        it('throws if the given publicKey does not match the publicKey', async () => {
            const keyPair = await ECDSA_SECP256R1.generateKeyPair()

            await ECDSAKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: binaryToHex(keyPair.publicKey).replace('b', 'd'),
                    privateKey: binaryToHex(keyPair.privateKey),
                }
            })
        })
    })

    describe('createMessageSignature', () => {

        it('creates correct signatures', async () => {
            const payload = Buffer.from('data-to-sign')
            const identity = await ECDSAKeyPairIdentity.generate()
            const signature = await identity.createMessageSignature(payload)
            expect(await ECDSA_SECP256R1.verifySignature(await identity.getUserIdBytes(), payload, signature)).toBe(true)
        })
    })
})
