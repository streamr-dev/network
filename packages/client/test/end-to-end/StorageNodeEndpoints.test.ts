import debug from 'debug'
import { Wallet } from 'ethers'
import { NotFoundError, Stream } from '../../src'
import { StreamrClient } from '../../src/StreamrClient'
import { until } from '../../src/utils'
import { StorageNodeAssignmentEvent } from '../../src/StorageNodeRegistry'
import { createTestStream, getCreateClient, fetchPrivateKeyWithGas } from '../test-utils/utils'

import { DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { EthereumAddress } from 'streamr-client-protocol'

jest.setTimeout(30000)
const log = debug('StreamrClient::NodeEndpointsIntegrationTest')

/**
 * These tests should be run in sequential order!
 */

let client: StreamrClient
let newStorageNodeClient: StreamrClient
let createdStream: Stream
let nodeAddress: EthereumAddress

const createClient = getCreateClient()

beforeAll(async () => {
    const key = await fetchPrivateKeyWithGas()
    client = await createClient({ auth: {
        privateKey: key
    } })
    const newStorageNodeWallet = new Wallet(await fetchPrivateKeyWithGas())
    newStorageNodeClient = await createClient({ auth: {
        privateKey: newStorageNodeWallet.privateKey
    } })
    nodeAddress = (await newStorageNodeWallet.getAddress())
    createdStream = await createTestStream(client, module, {})
})

describe('createNode', () => {
    it('creates a node ', async () => {
        const storageNodeMetadata = '{"http": "http://10.200.10.1:8891"}'
        await newStorageNodeClient.createOrUpdateNodeInStorageNodeRegistry(storageNodeMetadata)
        await until(async () => {
            try {
                return (await client.getStorageNodeUrl(nodeAddress)) !== null
            } catch (err) {
                log('node not found yet %o', err)
                return false
            }
        }, 100000, 1000)
        const createdNodeUrl = await client.getStorageNodeUrl(nodeAddress)
        return expect(createdNodeUrl).toEqual('http://10.200.10.1:8891')
    })

    it('addStreamToStorageNode, isStreamStoredInStorageNode', async () => {
        await client.addStreamToStorageNode(createdStream.id, nodeAddress)
        await until(async () => { return client.isStreamStoredInStorageNode(createdStream.id, nodeAddress) }, 100000, 1000)
        return expect(await client.isStreamStoredInStorageNode(createdStream.id, nodeAddress)).toEqual(true)
    })

    it('addStreamToStorageNode, isStreamStoredInStorageNode, eventlistener', async () => {
        const promise = Promise
        const callback = (event: StorageNodeAssignmentEvent) => {
            // check if they are values from this test and not other test running in parallel
            if (event.streamId === createdStream.id && event.nodeAddress === nodeAddress) {
                expect(event).toEqual({
                    blockNumber: expect.any(Number),
                    streamId: createdStream.id,
                    nodeAddress,
                    type: 'added'
                })
                promise.resolve()
            }
        }
        await client.registerStorageEventListener(callback)
        await client.addStreamToStorageNode(createdStream.id, nodeAddress)
        await promise
        await client.unregisterStorageEventListeners()
    })

    describe('getStorageNodes', () => {

        it('id', async () => {
            const storageNodeUrls: EthereumAddress[] = await client.getStorageNodes(createdStream.id)
            expect(storageNodeUrls.length).toEqual(1)
            return expect(storageNodeUrls[0]).toEqual(nodeAddress.toLowerCase())
        })
    
        it('all', async () => {
            const storageNodeUrls: EthereumAddress[] = await client.getStorageNodes()
            expect(storageNodeUrls.length).toBeGreaterThan(0)
            return expect(storageNodeUrls).toContain(nodeAddress.toLowerCase())
        })

    })

    it('getStoredStreamsOf', async () => {
        const { streams, blockNumber } = await client.getStoredStreamsOf(nodeAddress)
        expect(blockNumber).toBeGreaterThanOrEqual(0)
        expect(streams.length).toBeGreaterThan(0)
        return expect(streams.find((el) => { return el.id === createdStream.id })).toBeDefined()
    })

    it('removeStreamFromStorageNode', async () => {
        await client.removeStreamFromStorageNode(createdStream.id, nodeAddress)
        await until(async () => { return !(await client.isStreamStoredInStorageNode(createdStream.id, nodeAddress)) }, 100000, 1000)
        return expect(await client.isStreamStoredInStorageNode(createdStream.id, nodeAddress)).toEqual(false)
    })

    it('addStreamToStorageNode through stream object', async () => {
        const stream = await createTestStream(client, module)
        await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
        const isStored = await client.isStreamStoredInStorageNode(stream.id, DOCKER_DEV_STORAGE_NODE)
        expect(isStored).toEqual(true)
    })

    it('delete a node ', async () => {
        await newStorageNodeClient.removeNodeFromStorageNodeRegistry()
        await until(async () => {
            try {
                const res = await client.getStorageNodeUrl(nodeAddress)
                return res === null
            } catch (err) {
                if (err instanceof NotFoundError) { return true }
                log('node still there after being deleted %o', err)
                return false
            }
        }, 100000, 1000)
        return expect(client.getStorageNodeUrl(nodeAddress)).rejects.toThrow()
    })
})
