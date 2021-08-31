import { ethers, Wallet } from 'ethers'
import { BrubeckClient as StreamrClient } from '../../src/BrubeckClient'
import { NotFoundError, ValidationError } from '../../src/authFetch'
import { Stream, StreamOperation, StreamProperties } from '../../src/Stream'
import { StorageNode } from '../../src/StorageNode'

import { uid, fakeAddress, createTestStream } from '../utils'

import clientOptions from './config'
import { until } from '../utils'
import debug from 'debug'

jest.setTimeout(30000)

const log = debug('StreamrClient::StreamEndpointsIntegrationTest')

let pathCounter = 0
function getNewProps(): StreamProperties {
    pathCounter += 1
    return {
        // only counter is not sufficient, because re-running the test
        // would result in the same path and creating streams would fail
        id: `/path-${Date.now()}-${pathCounter}`
    }
}
/**
 * These tests should be run in sequential order!
 */

function TestStreamEndpoints(getName: () => string) {
    let client: StreamrClient
    let wallet: Wallet
    let createdStream: Stream

    const createClient = (opts = {}) => new StreamrClient({
        ...clientOptions,
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    } as any)

    beforeAll(() => {
        const key = clientOptions.auth.privateKey
        wallet = new Wallet(key)
        client = createClient({})
    })

    beforeAll(async () => {
        createdStream = await createTestStream(client, module, {
            name: getName(),
            requireSignedData: true,
            requireEncryptedData: false,
        })
    })

    describe('createStream', () => {
        it('creates a stream with correct values', async () => {
            const name = getName()
            const newProps = getNewProps()
            const stream = await client.createStream({
                ...newProps,
                name
            })
            expect(stream.id).toBeTruthy()
            return expect(stream.name).toBe(name)
        })

        it('valid id', async () => {
            const newId = `${wallet.address.toLowerCase()}/StreamEndpoints-createStream-newId-${Date.now()}`
            const newStream = await client.createStream({
                id: newId,
            })
            return expect(newStream.id).toEqual(newId)
        })

        it('valid path', async () => {
            const newPath = `/StreamEndpoints-createStream-newPath-${Date.now()}`
            const newStream = await client.createStream({
                id: newPath,
            })
            return expect(newStream.id).toEqual(`${wallet.address.toLowerCase()}${newPath}`)
        })

        it('invalid id', () => {
            return expect(() => client.createStream({ id: 'invalid.eth/foobar' })).rejects.toThrow()
        })
    })

    describe('getStream', () => {
        it('get an existing Stream', async () => {
            const stream = await client.createStream(getNewProps())
            await until(async () => {
                try {
                    return (await client.getStream(stream.id)).id === stream.id
                } catch (err) {
                    return false
                }
            }, 100000, 1000)
            const existingStream = await client.getStream(stream.id)
            return expect(existingStream.id).toEqual(stream.id)
        })

        it('get a non-existing Stream', async () => {
            const streamid = `${wallet.address.toLowerCase()}/StreamEndpoints-nonexisting-${Date.now()}`
            return expect(() => client.getStream(streamid)).rejects.toThrow(NotFoundError)
        })
    })

    describe('getStreamByName', () => {
        it('get an existing Stream', async () => {
            const props = getNewProps()
            props.name = 'name-' + Date.now()
            const stream = await client.createStream(props)
            // await new Promise((resolve) => setTimeout(resolve, 5000))
            const streamid = (await client.getAddress()).toLowerCase() + props.id
            await until(async () => {
                try {
                    return (await client.getStream(streamid)).id === stream.id
                } catch (err) {
                    log('stream not found yet %o', err)
                    return false
                }
            }, 100000, 1000)
            const existingStream = await client.getStreamByName(stream.name)
            return expect(existingStream.id).toEqual(stream.id)
        })

        it('get a non-existing Stream', async () => {
            const name = `${wallet.address.toLowerCase()}/StreamEndpoints-nonexisting-${Date.now()}`
            return expect(() => client.getStreamByName(name)).rejects.toThrow(NotFoundError)
        })
    })

    describe('liststreams with search and filters', () => {
        it('get streamlist', async () => {
            // create n streams to test offset and max
            const name = 'filter-' + Date.now()
            for (let i = 0; i < 3; i++) {
                const props = getNewProps()
                props.name = name + i
                // eslint-disable-next-line no-await-in-loop
                await client.createStream(props)
            }
            await until(async () => { return (await client.listStreams({ name })).length === 3 }, 20000, 1000)
            let resultList = await client.listStreams({
                name
            })
            expect(resultList.length).toBe(3)
            resultList = await client.listStreams({
                name,
                max: 2,
            })
            expect(resultList.length).toBe(2)
            expect(resultList[0].name.endsWith('0')).toBe(true)
            expect(resultList[1].name.endsWith('1')).toBe(true)
            resultList = await client.listStreams({
                name,
                max: 2,
                offset: 1
            })
            expect(resultList[0].name.endsWith('1')).toBe(true)
            return expect(resultList[1].name.endsWith('2')).toBe(true)
        })

        it('get a non-existing Stream', async () => {
            const name = `${wallet.address.toLowerCase()}/StreamEndpoints-nonexisting-${Date.now()}`
            return expect(() => client.getStreamByName(name)).rejects.toThrow()
        })
    })

    describe('getOrCreate', () => {
        it('existing Stream by name', async () => {
            const existingStream = await client.getOrCreateStream({
                name: createdStream.name,
            })
            expect(existingStream.id).toBe(createdStream.id)
            return expect(existingStream.name).toBe(createdStream.name)
        })

        it('existing Stream by id', async () => {
            const existingStream = await client.getOrCreateStream({
                id: createdStream.id,
            })
            expect(existingStream.id).toBe(createdStream.id)
            return expect(existingStream.name).toBe(createdStream.name)
        })

        it('new Stream by name', async () => {
            const newName = uid('stream')
            const props = getNewProps()
            props.name = newName
            const newStream = await client.getOrCreateStream(props)
            return expect(newStream.name).toEqual(newName)
        })

        it('new Stream by id', async () => {
            const newId = `${wallet.address.toLowerCase()}/StreamEndpoints-getOrCreate-newId-${Date.now()}`
            const newStream = await client.getOrCreateStream({
                id: newId,
            })
            return expect(newStream.id).toEqual(newId)
        })

        it('new Stream by path', async () => {
            const newPath = `/StreamEndpoints-getOrCreate-newPath-${Date.now()}`
            const newStream = await client.getOrCreateStream({
                id: newPath,
            })
            return expect(newStream.id).toEqual(`${wallet.address.toLowerCase()}${newPath}`)
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
            return expect(result[0].id).toBe(createdStream.id)
        })

        it('filters by given criteria (no  match)', async () => {
            const result = await client.listStreams({
                name: `non-existent-${Date.now()}`,
            })
            return expect(result.length).toBe(0)
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
            const address = await client.getAddress()
            return expect(publishers).toEqual([address])
        })
    })

    describe('isStreamPublisher', () => {
        it('returns true for valid publishers', async () => {
            const address = await client.getAddress()
            const valid = await client.isStreamPublisher(createdStream.id, address)
            return expect(valid).toBeTruthy()
        })
        it('returns trow error for invalid udseraddress', async () => {
            return expect(() => client.isStreamPublisher(createdStream.id, 'some-invalid-address')).rejects.toThrow()
        })
        it('returns false for invalid publishers', async () => {
            const valid = await client.isStreamPublisher(createdStream.id, '0x00')
            return expect(!valid).toBeTruthy()
        })
    })

    describe('getStreamSubscribers', () => {
        it('retrieves a list of publishers', async () => {
            const subscribers = await client.getStreamSubscribers(createdStream.id)
            const address = await client.getAddress()
            return expect(subscribers).toEqual([address])
        })
    })

    describe('isStreamSubscriber', () => {
        it('returns true for valid subscribers', async () => {
            const address = await client.getAddress()
            const valid = await client.isStreamSubscriber(createdStream.id, address)
            return expect(valid).toBeTruthy()
        })
        it('returns trow error for invalid udseraddress', async () => {
            return expect(() => client.isStreamSubscriber(createdStream.id, 'some-invalid-address')).rejects.toThrow()
        })
        it('returns false for invalid subscribers', async () => {
            const valid = await client.isStreamSubscriber(createdStream.id, '0x00')
            return expect(!valid).toBeTruthy()
        })
    })

    describe('Stream.update', () => {
        it('can change stream name', async () => {
            createdStream.name = 'Newname'
            await createdStream.update()
            await until(async () => {
                try {
                    return (await client.getStream(createdStream.id)).name === createdStream.name
                } catch (err) {
                    return false
                }
            }, 100000, 1000)
            const stream = await client.getStream(createdStream.id)
            return expect(stream.name).toEqual(createdStream.name)
        })
    })

    describe('Stream permissions', () => {
        it('Stream.getPermissions', async () => {
            const permissions = await createdStream.getPermissions()
            return expect(permissions.length).toBe(1)
        })

        it('Stream.hasPermission', async () => {
            return expect(await createdStream.hasPermission(StreamOperation.STREAM_SHARE, wallet.address.toLowerCase())).toEqual(true)
        })

        it('Stream.grantPermission', async () => {
            const recipient = fakeAddress()
            await createdStream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, recipient)
            await until(async () => {
                try {
                    return await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient)
                } catch (err) {
                    return false
                }
            }, 100000, 1000)
            return expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient)).toEqual(true)
        })

        it('Stream.revokePermission', async () => {
            const recipient = fakeAddress()
            await createdStream.revokePermission(StreamOperation.STREAM_SUBSCRIBE, recipient)
            await until(async () => {
                try {
                    return !(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient))
                } catch (err) {
                    return false
                }
            }, 100000, 1000)
            return expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient)).toEqual(false)
        })

        it('Stream.grantPublicPermission', async () => {
            const recipient = fakeAddress()
            await createdStream.grantPublicPermission(StreamOperation.STREAM_SUBSCRIBE)
            await until(async () => {
                try {
                    return await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient)
                } catch (err) {
                    return false
                }
            }, 100000, 1000)
            return expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient)).toEqual(true)
        })

        it('Stream.revokePublicPermission', async () => {
            const recipient = fakeAddress()
            await createdStream.revokePublicPermission(StreamOperation.STREAM_SUBSCRIBE)
            await until(async () => {
                try {
                    return !(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient))
                } catch (err) {
                    return false
                }
            }, 100000, 1000)
            return expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient)).toEqual(false)
        })
    })

    describe('Stream deletion', () => {
        it('Stream.delete', async () => {
            const stream = await client.createStream(getNewProps())
            await until(() => client.streamExistsOnTheGraph(stream.id), 100000, 1000)
            await stream.delete()
            await until(async () => {
                try {
                    await client.getStream(stream.id)
                    return false
                } catch (err) {
                    return err.errorCode === 'NOT_FOUND'
                }
            }, 100000, 1000)
            expect(await client.streamExists(stream.id)).toEqual(false)
            return expect(client.getStream(stream.id)).rejects.toThrow()
        })
    })

    describe('Storage node assignment', () => {
        it('add', async () => {
            const storageNode = await client.setNode(clientOptions.storageNode.url)
            // await stream.addToStorageNode(node.getAddress())// use actual storage nodes Address, actually register it
            const stream = await createTestStream(client, module)
            await stream.addToStorageNode(storageNode.getAddress())
            await until(async () => { return client.isStreamStoredInStorageNode(stream.id, storageNode.getAddress()) }, 100000, 1000)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes.length).toBe(1)
            expect(storageNodes[0].getAddress()).toBe(storageNode.getAddress())
            const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
            return expect(storedStreamParts.some(
                (sp) => (sp.streamId === stream.id) && (sp.streamPartition === 0)
            )).toBeTruthy()
        })

        it('remove', async () => {
            const storageNode = await client.setNode(clientOptions.storageNode.url)
            const stream = await createTestStream(client, module)
            await stream.addToStorageNode(storageNode)
            await until(async () => { return client.isStreamStoredInStorageNode(stream.id, storageNode.getAddress()) }, 100000, 1000)
            await stream.removeFromStorageNode(storageNode)
            await until(async () => { return !client.isStreamStoredInStorageNode(stream.id, storageNode.getAddress()) }, 100000, 1000)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes).toHaveLength(0)
            const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
            return expect(storedStreamParts.some(
                (sp) => (sp.streamId === stream.id)
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
