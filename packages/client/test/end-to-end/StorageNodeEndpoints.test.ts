import { Wallet } from 'ethers'
import { ConfigTest, Stream } from '../../src'
import { StreamrClient } from '../../src/StreamrClient'
import { StorageNodeAssignmentEvent } from '../../src/StorageNodeRegistry'
import { createTestStream, fetchPrivateKeyWithGas } from '../test-utils/utils'

import { DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { EthereumAddress } from 'streamr-client-protocol'

jest.setTimeout(30000)

/**
 * These tests should be run in sequential order!
 */

describe('createNode', () => {
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
        storageNodeAddress = storageNodeWallet.address
        createdStream = await createTestStream(client, module)
    })

    afterAll(async () => {
        await Promise.allSettled([
            client?.destroy(),
            storageNodeClient?.destroy()
        ])
    })

    it('creates a node', async () => {
        await storageNodeClient.createOrUpdateNodeInStorageNodeRegistry('{"http": "http://10.200.10.1:8891"}')
        const createdNodeUrl = await client.getStorageNodeUrl(storageNodeAddress)
        expect(createdNodeUrl).toEqual('http://10.200.10.1:8891')
    })

    it('add stream to storage node', async () => {
        await client.addStreamToStorageNode(createdStream.id, storageNodeAddress)
        expect(await client.isStreamStoredInStorageNode(createdStream.id, storageNodeAddress)).toEqual(true)
    })

    it('storage event listener', async () => {
        const promise = Promise
        const callback = (event: StorageNodeAssignmentEvent) => {
            // check if they are values from this test and not other test running in parallel
            if (event.streamId === createdStream.id && event.nodeAddress === storageNodeAddress) {
                expect(event).toEqual({
                    blockNumber: expect.any(Number),
                    streamId: createdStream.id,
                    nodeAddress: storageNodeAddress,
                    type: 'added'
                })
                promise.resolve()
            }
        }
        try {
            await client.registerStorageEventListener(callback)
            await client.addStreamToStorageNode(createdStream.id, storageNodeAddress)
            await promise
        } finally {
            await client?.unregisterStorageEventListeners()
        }
    })

    it('getStorageNodesOf', async () => {
        const storageNodeUrls = await client.getStorageNodesOf(createdStream.id)
        expect(storageNodeUrls).toEqual([storageNodeAddress.toLowerCase()])
    })

    it('getStoredStreamsOf', async () => {
        const { streams, blockNumber } = await client.getStoredStreamsOf(storageNodeAddress)
        expect(blockNumber).toBeGreaterThanOrEqual(0)
        expect(streams.find((el) => el.id === createdStream.id)).toBeDefined()
    })

    it('getAllStorageNodes', async () => {
        const storageNodeUrls = await client.getAllStorageNodes()
        return expect(storageNodeUrls).toContain(storageNodeAddress.toLowerCase())
    })

    it('removeStreamFromStorageNode', async () => {
        await client.removeStreamFromStorageNode(createdStream.id, storageNodeAddress)
        expect(await client.isStreamStoredInStorageNode(createdStream.id, storageNodeAddress)).toEqual(false)
    })

    it('addStreamToStorageNode through stream object', async () => {
        const stream = await createTestStream(client, module)
        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
        const isStored = await client.isStreamStoredInStorageNode(stream.id, DOCKER_DEV_STORAGE_NODE)
        expect(isStored).toEqual(true)
    })

    it('delete a node ', async () => {
        await storageNodeClient.removeNodeFromStorageNodeRegistry()
        return expect(client.getStorageNodeUrl(storageNodeAddress)).rejects.toThrow()
    })
})
