import debug from 'debug'
import { EthereumAddress, NotFoundError, StorageNode, Stream } from '../../src'
import { StreamrClient } from '../../src/StreamrClient'
import { until } from '../../src/utils'
import { createTestStream, getCreateClient } from '../utils'
// import { id } from '@ethersproject/hash'

import config from './config'

jest.setTimeout(300000)
const log = debug('StreamrClient::NodeEndpointsIntegrationTest')

/**
 * These tests should be run in sequential order!
 */

let client: StreamrClient
let storageNodeClient: StreamrClient
let createdStream: Stream
let createdNode: StorageNode
let nodeAddress: EthereumAddress

const createClient = getCreateClient()

beforeAll(async () => {
    const key = config.auth.privateKey
    // const hash = id(`marketplace-contracts${1}`)
    // return new Wallet(hash, provider)
    client = createClient({ auth: {
        privateKey: key
    } })
    storageNodeClient = createClient({ auth: {
        privateKey: config.storageNode.privatekey
    } })
    nodeAddress = config.storageNode.address.toLowerCase()
    createdStream = await createTestStream(client, module, {})
    return until(async () => {
        try {
            return await client.streamExists(createdStream.id)
        } catch (err) {
            log('stream not found yet %o', err)
            return false
        }
    }, 100000, 1000)
})

describe('createNode', () => {
    it('creates a node ', async () => {

        createdNode = await storageNodeClient.setNode(config.storageNode.url)
        await until(async () => {
            try {
                return (await client.getStorageNode(nodeAddress)) !== null
            } catch (err) {
                log('node not found yet %o', err)
                return false
            }
        }, 100000, 1000)
        expect(createdNode.getAddress()).toEqual(nodeAddress)
        return expect(createdNode.url).toEqual(config.storageNode.url)
    })

    it('addStreamToStorageNode, isStreamStoredInStorageNode', async () => {
        await client.addStreamToStorageNode(createdStream.id, nodeAddress)
        await until(async () => { return client.isStreamStoredInStorageNode(createdStream.id, nodeAddress) }, 100000, 1000)
        return expect(await client.isStreamStoredInStorageNode(createdStream.id, nodeAddress)).toEqual(true)
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
        await createdStream.addToStorageNode(nodeAddress)
        await until(async () => { return client.isStreamStoredInStorageNode(createdStream.id, nodeAddress) }, 100000, 1000)
        return expect(await client.isStreamStoredInStorageNode(createdStream.id, nodeAddress)).toEqual(true)
    })

    it('delete a node ', async () => {
        await storageNodeClient.removeNode()
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
