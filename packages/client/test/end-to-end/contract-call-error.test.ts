import { fastWallet, fetchPrivateKeyWithGas, KeyServer } from '@streamr/test-utils'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { StreamrClient } from '../../src/StreamrClient'

describe('contract call error', () => {

    afterAll(async () => {
        await KeyServer.stopIfRunning()
    })
    
    // TODO: see NET-1007, could improve error messages in fast-chain
    it('insufficient funds', async () => {
        const client = new StreamrClient({
            ...CONFIG_TEST,
            auth: {
                privateKey: fastWallet().privateKey
            }
        })
        await expect(() => client.createStream('/path')).rejects.toThrow(
            // eslint-disable-next-line max-len
            'Error while executing contract call "streamRegistry.createStream", reason=processing response error, code=SERVER_ERROR'
        )
    })

    it('invalid chain RPC url', async () => {
        const client = new StreamrClient({
            ...CONFIG_TEST,
            contracts: {
                streamRegistryChainRPCs: {
                    name: 'streamr',
                    chainId: 8997,
                    rpcs: [{
                        url: 'http://mock.test'
                    }]
                }
            }
        })
        await expect(() => client.createStream('/path')).rejects.toThrow(
            'Error while executing contract call "streamRegistry.createStream", reason=could not detect network, code=NETWORK_ERROR'
        )
    })

    it('concurrent transactions', async () => {
        const privateKey = await fetchPrivateKeyWithGas()
        const client = new StreamrClient({
            ...CONFIG_TEST,
            auth: {
                privateKey
            }
        })
        await expect(() => Promise.all([
            client.createStream('/path1' + Date.now()),
            client.createStream('/path2' + Date.now())
            // eslint-disable-next-line max-len
        ])).rejects.toThrow('Error while executing contract call "streamRegistry.createStream", reason=nonce has already been used, code=NONCE_EXPIRED')
    })
})
