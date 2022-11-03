import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { Wallet } from 'ethers'
import { fetchPrivateKeyWithGas, randomEthereumAddress } from 'streamr-test-utils'
import { ConfigTest, DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { createTestStream } from '../test-utils/utils'

jest.setTimeout(30000)

/**
 * These tests should be run in sequential order!
 * TODO: combine with StorageNodeRegistry.test.ts ?
 */
describe('StorageNodeRegistry2', () => {
    let client: StreamrClient
    let storageNodeClient: StreamrClient
    let createdStream: Stream
    let storageNodeAddress: EthereumAddress

    beforeAll(async () => {
        client = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: await fetchPrivateKeyWithGas()
            }
        })
        const storageNodeWallet = new Wallet(await fetchPrivateKeyWithGas())
        storageNodeClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: storageNodeWallet.privateKey
            }
        })
        storageNodeAddress = toEthereumAddress(storageNodeWallet.address)
        createdStream = await createTestStream(client, module)
    })

    afterAll(async () => {
        await Promise.allSettled([
            client?.destroy(),
            storageNodeClient?.destroy()
        ])
    })

    it('creates a node', async () => {
        const url = `http://mock.com/${Date.now()}`
        await storageNodeClient.setStorageNodeMetadata({
            http: url
        })
        const metadata = await storageNodeClient.getStorageNodeMetadata(storageNodeAddress)
        expect(metadata.http).toEqual(url)
    })

    it('add stream to storage node', async () => {
        await client.addStreamToStorageNode(createdStream.id, storageNodeAddress)
        expect(await client.isStoredStream(createdStream.id, storageNodeAddress)).toEqual(true)
    })

    describe('getStorageNodes', () => {
        it('id', async () => {
            const storageNodeUrls = await client.getStorageNodes(createdStream.id)
            expect(storageNodeUrls).toEqual([storageNodeAddress])
        })

        it('all', async () => {
            const storageNodeUrls = await client.getStorageNodes()
            return expect(storageNodeUrls).toContain(storageNodeAddress)
        })
    })

    it('getStoredStreams', async () => {
        const { streams, blockNumber } = await client.getStoredStreams(storageNodeAddress)
        expect(blockNumber).toBeGreaterThanOrEqual(0)
        expect(streams.find((el) => el.id === createdStream.id)).toBeDefined()
    })

    it('removeStreamFromStorageNode', async () => {
        await client.removeStreamFromStorageNode(createdStream.id, storageNodeAddress)
        expect(await client.isStoredStream(createdStream.id, storageNodeAddress)).toEqual(false)
    })

    it('addStreamToStorageNode through stream object', async () => {
        const stream = await createTestStream(client, module)
        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
        const isStored = await client.isStoredStream(stream.id, DOCKER_DEV_STORAGE_NODE)
        expect(isStored).toEqual(true)
    })

    it('delete a node', async () => {
        await storageNodeClient.setStorageNodeMetadata(undefined)
        return expect(storageNodeClient.getStorageNodeMetadata(storageNodeAddress)).rejects.toThrow()
    })

    it('metadata from non-existing node', async () => {
        return expect(async () => {
            await storageNodeClient.getStorageNodeMetadata(randomEthereumAddress())
        }).rejects.toThrow('Node not found')
    })
})
