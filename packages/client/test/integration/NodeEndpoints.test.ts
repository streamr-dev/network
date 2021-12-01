import debug from 'debug'
import { Wallet } from 'ethers'
// import { wait } from 'streamr-test-utils'
import { EthereumAddress, NotFoundError, StorageNode, Stream } from '../../src'
import { StreamrClient } from '../../src/StreamrClient'
import { until } from '../../src/utils'
import { EthereumStorageEvent } from '../../src/NodeRegistry'
import { createTestStream, getCreateClient, getPrivateKey } from '../utils'
// import { id } from '@ethersproject/hash'

import config from './config'

jest.setTimeout(30000)
const log = debug('StreamrClient::NodeEndpointsIntegrationTest')

/**
 * These tests should be run in sequential order!
 */

let client: StreamrClient
let newStorageNodeClient: StreamrClient
let createdStream: Stream
let createdNode: StorageNode
let nodeAddress: EthereumAddress

const createClient = getCreateClient()

beforeAll(async () => {
    const key = await getPrivateKey()
    client = await createClient({ auth: {
        privateKey: key
    } })
    const newStorageNodeWallet = new Wallet(await getPrivateKey())
    newStorageNodeClient = await createClient({ auth: {
        privateKey: newStorageNodeWallet.privateKey
    } })
    nodeAddress = (await newStorageNodeWallet.getAddress())
    createdStream = await createTestStream(client, module, {})
})

describe('createNode', () => {
    it('creates a node ', async () => {
        const storageNodeUrl = 'http://asd.com'
        createdNode = await newStorageNodeClient.setNode(storageNodeUrl)
        await until(async () => {
            try {
                return (await client.getStorageNode(nodeAddress)) !== null
            } catch (err) {
                log('node not found yet %o', err)
                return false
            }
        }, 100000, 1000)
        expect(createdNode.getAddress()).toEqual(nodeAddress.toLowerCase())
        return expect(createdNode.url).toEqual(storageNodeUrl)
    })

    it('addStreamToStorageNode, isStreamStoredInStorageNode', async () => {
        await client.addStreamToStorageNode(createdStream.id, nodeAddress)
        await until(async () => { return client.isStreamStoredInStorageNode(createdStream.id, nodeAddress) }, 100000, 1000)
        return expect(await client.isStreamStoredInStorageNode(createdStream.id, nodeAddress)).toEqual(true)
    })

    it('addStreamToStorageNode, isStreamStoredInStorageNode, eventlistener', async () => {
        const promise = Promise
        const callback = (event: EthereumStorageEvent) => {
            // check if they are values from this test and not other test running in parallel
            if (event.streamId === createdStream.id && event.nodeAddress === nodeAddress) {
                expect(event).toEqual({
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
        await client.unRegisterStorageEventListeners()
    })

    it('getStorageNodesOf', async () => {
        const storageNodes: StorageNode[] = await client.getStorageNodesOf(createdStream.id)
        expect(storageNodes.length).toEqual(1)
        return expect(storageNodes[0].getAddress()).toEqual(nodeAddress.toLowerCase())
    })

    it('getStoredStreamsOf', async () => {
        const streams: Stream[] = await client.getStoredStreamsOf(nodeAddress)
        expect(streams.length).toBeGreaterThan(0)
        return expect(streams.find((el) => { return el.id === createdStream.id })).toBeDefined()
    })

    it('getAllStorageNodes', async () => {
        const storageNodes: StorageNode[] = await client.getAllStorageNodes()
        expect(storageNodes.length).toBeGreaterThan(0)
        return expect(storageNodes.map((node) => { return node.getAddress() })).toContain(nodeAddress.toLowerCase())
    })

    it('removeStreamFromStorageNode', async () => {
        await client.removeStreamFromStorageNode(createdStream.id, nodeAddress)
        await until(async () => { return !(await client.isStreamStoredInStorageNode(createdStream.id, nodeAddress)) }, 100000, 1000)
        return expect(await client.isStreamStoredInStorageNode(createdStream.id, nodeAddress)).toEqual(false)
    })

    it('addStreamToStorageNode through streamobject', async () => {
        const storageNodeClientFromDevEnv = await createClient({ auth: {
            privateKey: config.storageNode.privatekey
        } })
        const storageNodeDev = await storageNodeClientFromDevEnv.setNode(config.storageNode.url)
        await createdStream.addToStorageNode(await storageNodeDev.getAddress())
        return expect(await client.isStreamStoredInStorageNode(createdStream.id, await storageNodeDev.getAddress())).toEqual(true)
    })

    it('delete a node ', async () => {
        await newStorageNodeClient.removeNode()
        await until(async () => {
            try {
                const res = await client.getStorageNode(nodeAddress)
                return res === null
            } catch (err) {
                if (err instanceof NotFoundError) { return true }
                log('node still there after being deleted %o', err)
                return false
            }
        }, 100000, 1000)
        return expect(client.getStorageNode(nodeAddress)).rejects.toThrow()
    })
})

// these tests are the same as in StremEndpoints
// describe('Storage node assignment', () => {
//     it('add', async () => {
//         const storageNode = StorageNode.STREAMR_DOCKER_DEV
//         const stream = await client.createStream()
//         await stream.addToStorageNode(storageNode)
//         const storageNodes = await stream.getStorageNodes()
//         expect(storageNodes.length).toBe(1)
//         expect(storageNodes[0].getAddress()).toBe(storageNode.getAddress())
//         const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
//         expect(storedStreamParts.some(
//             (sp) => (sp.getStreamId() === stream.id) && (sp.getStreamPartition() === 0)
//         )).toBeTruthy()
//     })

//     it('remove', async () => {
//         const storageNode = StorageNode.STREAMR_DOCKER_DEV
//         const stream = await client.createStream()
//         await stream.addToStorageNode(storageNode)
//         await stream.removeFromStorageNode(storageNode)
//         const storageNodes = await stream.getStorageNodes()
//         expect(storageNodes).toHaveLength(0)
//         const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
//         expect(storedStreamParts.some(
//             (sp) => (sp.getStreamId() === stream.id)
//         )).toBeFalsy()
//     })
// })
