import { hexToBinary } from '@streamr/utils'
import { EthereumKeyPairIdentity } from '../../src/identity/EthereumKeyPairIdentity'
import { Wallet } from 'ethers'

const PRIVATE_KEY = '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709'

describe('EthereumKeyPairIdentity', () => {

    describe('fromConfig', () => {
        const wallet = new Wallet(PRIVATE_KEY)

        it('can be created without 0x prefix on private key', async () => {
            const keyPair = EthereumKeyPairIdentity.fromConfig({
                auth: {
                    privateKey: PRIVATE_KEY,
                }
            })
            expect(await keyPair.getUserIdString()).toBe(wallet.address.toLowerCase())
        })
        it('can be created with 0x prefix on private key', async () => {
            const keyPair = EthereumKeyPairIdentity.fromConfig({
                auth: {
                    privateKey: `0x${PRIVATE_KEY}`
                }
            })
            expect(await keyPair.getUserIdString()).toBe(wallet.address.toLowerCase())
        })
        it('accepts the address as the publicKey', async () => {
            const keyPair = EthereumKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: wallet.address,
                    privateKey: `0x${PRIVATE_KEY}`
                }
            })
            expect(await keyPair.getUserIdString()).toBe(wallet.address.toLowerCase())
        })
        it('throws if the given publicKey does not match the publicKey', async () => {
            expect(() => EthereumKeyPairIdentity.fromConfig({
                auth: {
                    publicKey: wallet.address.replace('b', 'd'),
                    privateKey: `0x${PRIVATE_KEY}`
                }
            })).toThrow()
        })
    })

    describe('createMessageSignature', () => {

        it('creates correct signatures', async () => {
            const payload = Buffer.from('data-to-sign')
            const identity = EthereumKeyPairIdentity.fromPrivateKey(PRIVATE_KEY)
            const signature = await identity.createMessageSignature(payload)
            expect(signature).toStrictEqual(hexToBinary('0x084b3ac0f2ad17d387ca5bbf5d72d8f1dfd1b372e399ce6b0bfc60793e'
                + 'b717d2431e498294f202d8dfd9f56158391d453c018470aea92ed6a80a23c20ab6f7ac1b'))
        })
    })
})
