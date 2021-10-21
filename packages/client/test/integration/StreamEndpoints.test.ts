import { Wallet } from 'ethers'

import { clientOptions, uid, createTestStream, until, fakeAddress, createRelativeTestStreamId, getCreateClient, getPrivateKey } from '../utils'
import { NotFoundError } from '../../src/authFetch'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream, StreamOperation } from '../../src/Stream'
import { StorageNode } from '../../src/StorageNode'
import { wait } from 'streamr-test-utils'

jest.setTimeout(30000)

const createClient = getCreateClient()

/**
 * These tests should be run in sequential order!
 */
function TestStreamEndpoints(getName: () => string, delay: number) {
    let client: StreamrClient
    let wallet: Wallet
    let createdStream: Stream
    let storageNode: StorageNode

    const createFullTestStreamId = async (module: any): Promise<string> => {
        return (await (await wallet.getAddress()).toLowerCase()) + createRelativeTestStreamId(module)
    }

    beforeAll(async () => {
        await wait(delay)
        const key = await getPrivateKey()
        wallet = new Wallet(key)
        client = await createClient({
            auth: {
                privateKey: key
            }
        })
    })

    beforeAll(async () => {
        createdStream = await createTestStream(client, module, {
            name: getName(),
            requireSignedData: true,
            requireEncryptedData: false,
        })
        const storageNodeWallet = new Wallet(clientOptions.storageNode.privatekey)
        storageNode = await client.getStorageNode(await storageNodeWallet.getAddress())
    })

    describe('createStream', () => {
        it('creates a stream with correct values', async () => {
            const name = getName()
            const id = await createFullTestStreamId(module)
            const stream = await client.createStream({
                id,
                name,
                requireSignedData: true,
                requireEncryptedData: true,
            })
            await until(async () => { return client.streamExistsOnTheGraph(id) }, 100000, 1000)
            expect(stream.id).toBeTruthy()
            return expect(stream.name).toBe(name)
        })

        it('valid id', async () => {
            const newId = `${wallet.address.toLowerCase()}/StreamEndpoints-createStream-newId-${Date.now()}`
            const newStream = await client.createStream({
                id: newId,
            })
            await until(async () => { return client.streamExistsOnTheGraph(newId) }, 100000, 1000)
            expect(newStream.id).toEqual(newId)
        })

        it('valid path', async () => {
            const newPath = `/StreamEndpoints-createStream-newPath-${Date.now()}`
            const expectedId = `${wallet.address.toLowerCase()}${newPath}`
            const newStream = await client.createStream({
                id: newPath,
            })
            await until(async () => { return client.streamExistsOnTheGraph(expectedId) }, 100000, 1000)
            expect(newStream.id).toEqual(expectedId)
        })

        it('invalid id', async () => {
            await expect(async () => client.createStream({ id: 'invalid.eth/foobar' })).rejects.toThrow()
        })
    })

    describe('getStream', () => {
        it('get an existing Stream', async () => {
            const stream = await createTestStream(client, module)
            const existingStream = await client.getStream(stream.id)
            expect(existingStream.id).toEqual(stream.id)
        })

        it('get a non-existing Stream', async () => {
            const streamid = `${wallet.address.toLowerCase()}/StreamEndpoints-nonexisting-${Date.now()}`
            return expect(() => client.getStream(streamid)).rejects.toThrow(NotFoundError)
        })
    })

    describe('getStreamByName', () => {
        it('get an existing Stream', async () => {
            const name = 'name-' + Date.now()
            const props = { id: await createFullTestStreamId(module), name }
            const stream = await client.createStream(props)
            await until(async () => { return client.streamExistsOnTheGraph(stream.id) }, 100000, 1000)
            // await new Promise((resolve) => setTimeout(resolve, 5000))
            const existingStream = await client.getStreamByName(stream.name)
            expect(existingStream.id).toEqual(stream.id)
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
                // eslint-disable-next-line no-await-in-loop
                const props = { id: await createFullTestStreamId(module), name }
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
            const props = { id: await createFullTestStreamId(module), name: '' }
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
        it('does error if has no storage assigned', async () => {
            await expect(async () => {
                await client.getStreamLast(createdStream.id)
            }).rejects.toThrow()
        })

        it('does not error if has storage assigned', async () => {
            const stream = await client.createStream({
                id: await createFullTestStreamId(module),
            })
            await stream.addToStorageNode(storageNode)
            await until(async () => { return client.isStreamStoredInStorageNode(stream.id, storageNode.getAddress()) }, 100000, 1000)
            const result = await client.getStreamLast(stream.id)
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
            const props = { id: await createFullTestStreamId(module), name: '' }
            const stream = await client.createStream(props)
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
            // await stream.addToStorageNode(node.getAddress())// use actual storage nodes Address, actually register it
            const stream = await createTestStream(client, module)
            await stream.addToStorageNode(storageNode.getAddress())
            await until(async () => { return client.isStreamStoredInStorageNode(stream.id, storageNode.getAddress()) }, 100000, 1000)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes.length).toBe(1)
            expect(storageNodes[0]).toStrictEqual(storageNode)
            const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
            return expect(storedStreamParts.some(
                (sp) => (sp.streamId === stream.id) && (sp.streamPartition === 0)
            )).toBeTruthy()
        })

        it('remove', async () => {
            const stream = await createTestStream(client, module)
            await stream.addToStorageNode(storageNode)
            await until(async () => { return client.isStreamStoredInStorageNode(stream.id, storageNode.getAddress()) }, 100000, 1000)
            await stream.removeFromStorageNode(storageNode)
            await until(async () => { return !(await client.isStreamStoredInStorageNode(stream.id, storageNode.getAddress())) }, 100000, 1000)
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
        TestStreamEndpoints(() => uid('test-stream'), 0)
    })

    describe('using name with slashes', () => {
        TestStreamEndpoints(() => uid('test-stream/slashes'), 4000)
    })
})
