import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { StreamrClient } from '../../src/StreamrClient'

describe('contract call error', () => {
    // TODO: see NET-1007, could improve error messages in fast-chain
    it('insufficient funds', async () => {
        const client = new StreamrClient({
            environment: 'dev2',
            auth: {
                privateKey: fastWallet().privateKey
            }
        })
        await expect(() => client.createStream('/path')).rejects.toThrow(
            'Error while executing contract call "streamRegistry.createStream", code=UNKNOWN_ERROR'
        )
    })

    it('invalid chain RPC url', async () => {
        const client = new StreamrClient({
            environment: 'dev2',
            contracts: {
                rpcs: [
                    {
                        url: 'http://mock.test'
                    }
                ]
            }
        })
        await expect(() => client.createStream('/path')).rejects.toThrow(
            'Error while executing contract call "streamRegistry.createStream"'
        )
    })

    it('concurrent transactions', async () => {
        const privateKey = await fetchPrivateKeyWithGas()
        const client = new StreamrClient({
            environment: 'dev2',
            auth: {
                privateKey
            }
        })
        await expect(() =>
            Promise.all([client.createStream('/path1' + Date.now()), client.createStream('/path2' + Date.now())])
        ).rejects.toThrow('Error while executing contract call "streamRegistry.createStream", code=NONCE_EXPIRED')
    })
})
