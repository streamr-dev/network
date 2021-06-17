import { ethers, Wallet } from 'ethers'
import { NotFoundError, ValidationError } from '../../src/rest/authFetch'
import { Stream, StreamOperation } from '../../src/stream'
import { StorageNode } from '../../src/stream/StorageNode'

import { StreamrClient } from '../../src/StreamrClient'
import { uid, fakeAddress } from '../utils'

import { clientOptions } from './devEnvironment'

/**
 * These tests should be run in sequential order!
 */

function TestStreamEndpoints(getName: () => string) {
    let client: StreamrClient
    let wallet: Wallet
    let createdStreamPath: string
    let createdStream: Stream

    const createClient = (opts = {}) => new StreamrClient({
        ...clientOptions,
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    } as any)

    beforeAll(() => {
        wallet = ethers.Wallet.createRandom()
        client = createClient({
            auth: {
                privateKey: wallet.privateKey,
            },
        })
    })

    beforeAll(async () => {
        createdStreamPath = `/StreamEndpoints-${Date.now()}`
        createdStream = await client.createStream({
            id: `${wallet.address}${createdStreamPath}`,
            name: getName(),
            requireSignedData: true,
            requireEncryptedData: false,
        })
    })

    describe('createStream', () => {
        it('creates a stream with correct values', async () => {
            const name = getName()
            const stream = await client.createStream({
                name,
                requireSignedData: true,
                requireEncryptedData: true,
            })
            expect(stream.id).toBeTruthy()
            expect(stream.name).toBe(name)
            expect(stream.requireSignedData).toBe(true)
            expect(stream.requireEncryptedData).toBe(true)
        })

        it('valid id', async () => {
            const newId = `${wallet.address}/StreamEndpoints-createStream-newId-${Date.now()}`
            const newStream = await client.createStream({
                id: newId,
            })
            expect(newStream.id).toEqual(newId)
        })

        it('valid path', async () => {
            const newPath = `/StreamEndpoints-createStream-newPath-${Date.now()}`
            const newStream = await client.createStream({
                id: newPath,
            })
            expect(newStream.id).toEqual(`${wallet.address.toLowerCase()}${newPath}`)
        })

        it('invalid id', () => {
            return expect(() => client.createStream({ id: 'invalid.eth/foobar' })).rejects.toThrow(ValidationError)
        })
    })

    describe('getStream', () => {
        it('get an existing Stream', async () => {
            const stream = await client.createStream()
            const existingStream = await client.getStream(stream.id)
            expect(existingStream.id).toEqual(stream.id)
        })

        it('get a non-existing Stream', async () => {
            const id = `${wallet.address}/StreamEndpoints-nonexisting-${Date.now()}`
            return expect(() => client.getStream(id)).rejects.toThrow(NotFoundError)
        })
    })

    describe('getStreamByName', () => {
        it('get an existing Stream', async () => {
            const stream = await client.createStream()
            const existingStream = await client.getStreamByName(stream.name)
            expect(existingStream.id).toEqual(stream.id)
        })

        it('get a non-existing Stream', async () => {
            const name = `${wallet.address}/StreamEndpoints-nonexisting-${Date.now()}`
            return expect(() => client.getStreamByName(name)).rejects.toThrow(NotFoundError)
        })
    })

    describe('getOrCreate', () => {
        it('existing Stream by name', async () => {
            const existingStream = await client.getOrCreateStream({
                name: createdStream.name,
            })
            expect(existingStream.id).toBe(createdStream.id)
            expect(existingStream.name).toBe(createdStream.name)
        })

        it('existing Stream by id', async () => {
            const existingStream = await client.getOrCreateStream({
                id: createdStream.id,
            })
            expect(existingStream.id).toBe(createdStream.id)
            expect(existingStream.name).toBe(createdStream.name)
        })

        it('new Stream by name', async () => {
            const newName = uid('stream')
            const newStream = await client.getOrCreateStream({
                name: newName,
            })
            expect(newStream.name).toEqual(newName)
        })

        it('new Stream by id', async () => {
            const newId = `${wallet.address}/StreamEndpoints-getOrCreate-newId-${Date.now()}`
            const newStream = await client.getOrCreateStream({
                id: newId,
            })
            expect(newStream.id).toEqual(newId)
        })

        it('new Stream by path', async () => {
            const newPath = `/StreamEndpoints-getOrCreate-newPath-${Date.now()}`
            const newStream = await client.getOrCreateStream({
                id: newPath,
            })
            expect(newStream.id).toEqual(`${wallet.address.toLowerCase()}${newPath}`)
        })

        it('fails if stream prefixed with other users address', async () => {
            // can't create streams for other users
            const otherAddress = `0x${fakeAddress()}`
            const newPath = `/StreamEndpoints-getOrCreate-newPath-${Date.now()}`
            // backend should error
            await expect(async () => {
                await client.getOrCreateStream({
                    id: `${otherAddress}${newPath}`,
                })
            }).rejects.toThrow('Validation')
        })
    })

    describe('listStreams', () => {
        it('filters by given criteria (match)', async () => {
            const result = await client.listStreams({
                name: createdStream.name,
            })
            expect(result.length).toBe(1)
            expect(result[0].id).toBe(createdStream.id)
        })

        it('filters by given criteria (no  match)', async () => {
            const result = await client.listStreams({
                name: `non-existent-${Date.now()}`,
            })
            expect(result.length).toBe(0)
        })
    })

    describe('getStreamLast', () => {
        it('does not error', async () => {
            const result = await client.getStreamLast(createdStream.id)
            expect(result).toEqual([])
        })
    })

    describe('getStreamPublishers', () => {
        it('retrieves a list of publishers', async () => {
            const publishers = await client.getStreamPublishers(createdStream.id)
            const address = await client.getUserId()
            expect(publishers).toEqual([address])
        })
    })

    describe('isStreamPublisher', () => {
        it('returns true for valid publishers', async () => {
            const address = await client.getUserId()
            const valid = await client.isStreamPublisher(createdStream.id, address)
            expect(valid).toBeTruthy()
        })
        it('returns false for invalid publishers', async () => {
            const valid = await client.isStreamPublisher(createdStream.id, 'some-wrong-address')
            expect(!valid).toBeTruthy()
        })
    })

    describe('getStreamSubscribers', () => {
        it('retrieves a list of publishers', async () => {
            const subscribers = await client.getStreamSubscribers(createdStream.id)
            const address = await client.getUserId()
            expect(subscribers).toEqual([address])
        })
    })

    describe('isStreamSubscriber', () => {
        it('returns true for valid subscribers', async () => {
            const address = await client.getUserId()
            const valid = await client.isStreamSubscriber(createdStream.id, address)
            expect(valid).toBeTruthy()
        })
        it('returns false for invalid subscribers', async () => {
            const valid = await client.isStreamSubscriber(createdStream.id, 'some-wrong-address')
            expect(!valid).toBeTruthy()
        })
    })

    describe('getStreamValidationInfo', () => {
        it('returns an object with expected fields', async () => {
            const result = await client.getStreamValidationInfo(createdStream.id)
            expect(result.partitions > 0).toBeTruthy()
            expect(result.requireSignedData === true).toBeTruthy()
            expect(result.requireEncryptedData === false).toBeTruthy()
        })
    })

    describe('Stream.update', () => {
        it('can change stream name', async () => {
            createdStream.name = 'New name'
            await createdStream.update()
        })
    })

    describe('Stream permissions', () => {
        it('Stream.getPermissions', async () => {
            const permissions = await createdStream.getPermissions()
            // get, edit, delete, subscribe, publish, share
            expect(permissions.length).toBe(6)
        })

        it('Stream.hasPermission', async () => {
            expect(await createdStream.hasPermission(StreamOperation.STREAM_SHARE, wallet.address)).toBeTruthy()
        })

        it('Stream.grantPermission', async () => {
            await createdStream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, undefined) // public read
            expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, undefined)).toBeTruthy()
        })

        it('Stream.revokePermission', async () => {
            const publicRead = await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, undefined)
            await createdStream.revokePermission(publicRead!.id)
            expect(!(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, undefined))).toBeTruthy()
        })
    })

    describe('Stream deletion', () => {
        it('Stream.delete', async () => {
            await createdStream.delete()
            return expect(() => client.getStream(createdStream.id)).rejects.toThrow(NotFoundError)
        })
    })

    describe('Storage node assignment', () => {
        it('add', async () => {
            const storageNode = StorageNode.STREAMR_DOCKER_DEV
            const stream = await client.createStream()
            await stream.addToStorageNode(storageNode)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes.length).toBe(1)
            expect(storageNodes[0].getAddress()).toBe(storageNode.getAddress())
            const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
            expect(storedStreamParts.some(
                (sp) => (sp.getStreamId() === stream.id) && (sp.getStreamPartition() === 0)
            )).toBeTruthy()
        })

        it('remove', async () => {
            const storageNode = StorageNode.STREAMR_DOCKER_DEV
            const stream = await client.createStream()
            await stream.addToStorageNode(storageNode)
            await stream.removeFromStorageNode(storageNode)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes).toHaveLength(0)
            const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
            expect(storedStreamParts.some(
                (sp) => (sp.getStreamId() === stream.id)
            )).toBeFalsy()
        })
    })
}

describe('StreamEndpoints', () => {
    describe('using normal name', () => {
        TestStreamEndpoints(() => uid('test-stream'))
    })

    describe('using name with slashes', () => {
        TestStreamEndpoints(() => uid('test-stream/slashes'))
    })
})
