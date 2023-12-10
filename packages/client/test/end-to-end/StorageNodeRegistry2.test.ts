import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { Wallet } from '@ethersproject/wallet'
import { fetchPrivateKeyWithGas, randomEthereumAddress } from '@streamr/test-utils'
import { DOCKER_DEV_STORAGE_NODE, KEYSERVER_PORT } from '../../src/ConfigTest'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { createTestStream, createTestClient } from '../test-utils/utils'

jest.setTimeout(30000)

/**
 * TODO: combine with StorageNodeRegistry.test.ts ?
 */
describe('StorageNodeRegistry2', () => {
    let client: StreamrClient
    let storageNodeClient: StreamrClient
    let createdStream: Stream
    let storageNodeAddress: EthereumAddress

    beforeAll(async () => {
        client = createTestClient(await fetchPrivateKeyWithGas(KEYSERVER_PORT), 43236)
        const storageNodeWallet = new Wallet(await fetchPrivateKeyWithGas(KEYSERVER_PORT))
        storageNodeClient = createTestClient(storageNodeWallet.privateKey, 43237)
        storageNodeAddress = toEthereumAddress(storageNodeWallet.address)
        createdStream = await createTestStream(client, module)
    })

    afterAll(async () => {
        await Promise.allSettled([
            client?.destroy(),
            storageNodeClient?.destroy()
        ])
    })

    it('storage node operations', async () => {
        // set metadata 
        const url = `http://mock.com/${Date.now()}`
        await storageNodeClient.setStorageNodeMetadata({
            http: url
        })
        const metadata = await storageNodeClient.getStorageNodeMetadata(storageNodeAddress)
        expect(metadata.http).toEqual(url)

        // add stream to storage node
        await client.addStreamToStorageNode(createdStream.id, storageNodeAddress)
        expect(await client.isStoredStream(createdStream.id, storageNodeAddress)).toEqual(true)

        // getById'
        const urls = await client.getStorageNodes(createdStream.id)
        expect(urls).toEqual([storageNodeAddress])

        // getAll
        const urls2 = await client.getStorageNodes()
        expect(urls2).toContain(storageNodeAddress)

        // getStoredStreams
        const { streams, blockNumber } = await client.getStoredStreams(storageNodeAddress)
        expect(blockNumber).toBeGreaterThanOrEqual(0)
        expect(streams.find((el) => el.id === createdStream.id)).toBeDefined()

        // removeStreamFromStorageNode
        await client.removeStreamFromStorageNode(createdStream.id, storageNodeAddress)
        expect(await client.isStoredStream(createdStream.id, storageNodeAddress)).toEqual(false)

        // addStreamToStorageNode through stream object
        const stream = await createTestStream(client, module)
        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
        const isStored = await client.isStoredStream(stream.id, DOCKER_DEV_STORAGE_NODE)
        expect(isStored).toEqual(true)
        // assign again: no-op
        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
        const isStored2 = await client.isStoredStream(stream.id, DOCKER_DEV_STORAGE_NODE)
        expect(isStored2).toEqual(true)

        // delete a node'
        await storageNodeClient.setStorageNodeMetadata(undefined)
        expect(storageNodeClient.getStorageNodeMetadata(storageNodeAddress)).rejects.toThrow()
    })

    it('metadata from non-existing node', async () => {
        return expect(async () => {
            await storageNodeClient.getStorageNodeMetadata(randomEthereumAddress())
        }).rejects.toThrow('Node not found')
    })
})
