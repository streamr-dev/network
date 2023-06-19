import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import range from 'lodash/range'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { StreamrClient } from '../../src/StreamrClient'

describe('contract call error', () => {
    
    it('insufficient funds', async () => {
        const client = new StreamrClient({
            ...CONFIG_TEST,
            auth: {
                privateKey: fastWallet().privateKey
            }
        })
        await expect(() => client.createStream('/path')).rejects.toThrow(
            // eslint-disable-next-line max-len
            'Error while executing contract call "streamRegistry.createStream", reason=insufficient funds for intrinsic transaction cost, code=INSUFFICIENT_FUNDS'
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
        ])).rejects.toThrow('Error while executing contract call "streamRegistry.createStream", reason=replacement fee too low, code=REPLACEMENT_UNDERPRICED')
    })

    it('concurrent transactions with different clients', async () => {
        const privateKey = await fetchPrivateKeyWithGas()
        await expect(() => Promise.all(range(2).map((i) => {
            const client = new StreamrClient({
                ...CONFIG_TEST,
                auth: {
                    privateKey
                }
            })
            return client.createStream(`/path${i}`)
        }))).rejects.toThrow(
            // eslint-disable-next-line max-len
            'Error while executing contract call "streamRegistry.createStream", reason=cannot estimate gas; transaction may fail or may require manual gas limit, code=UNPREDICTABLE_GAS_LIMIT'
        )
    })
})
