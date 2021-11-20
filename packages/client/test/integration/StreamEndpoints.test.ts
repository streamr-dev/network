import { ethers, Wallet } from 'ethers'
import { StreamrClient } from '../../src/StreamrClient'

import { NotFoundError, ValidationError } from '../../src/authFetch'
import { Stream, StreamOperation } from '../../src/Stream'
import { StorageNode } from '../../src/StorageNode'
import { clientOptions, uid, fakeAddress, createTestStream, createRelativeTestStreamId } from '../utils'

/**
 * These tests should be run in sequential order!
 */

function TestStreamEndpoints(getName: () => string) {
    let client: StreamrClient
    let wallet: Wallet
    let createdStream: Stream
    let otherWallet: Wallet

    beforeAll(() => {
        wallet = ethers.Wallet.createRandom()
        otherWallet = ethers.Wallet.createRandom()
        client = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: wallet.privateKey,
            },
        })
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
            const stream = await client.createStream({
                id: createRelativeTestStreamId(module),
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
            const stream = await createTestStream(client, module)
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
            const stream = await createTestStream(client, module)
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

            // ensure can get after create i.e. doesn't try create again
            const sameStream = await client.getOrCreateStream({
                id: newPath,
            })
            expect(sameStream.id).toEqual(newStream.id)
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
            }).rejects.toThrow(/validation/gi)
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
        it('does error if has no storage assigned', async () => {
            await expect(async () => {
                await client.getStreamLast(createdStream.id)
            }).rejects.toThrow()
        })

        it('does not error if has storage assigned', async () => {
            const stream = await client.createStream({
                id: createRelativeTestStreamId(module),
            })
            await stream.addToStorageNode(StorageNode.STREAMR_DOCKER_DEV)
            const result = await client.getStreamLast(stream.id)
            expect(result).toEqual([])
        })
    })

    describe('getStreamPublishers', () => {
        it('retrieves a list of publishers', async () => {
            const publishers = await client.getStreamPublishers(createdStream.id)
            const address = await client.getAddress()
            expect(publishers).toEqual([address.toLowerCase()])
        })
    })

    describe('isStreamPublisher', () => {
        it('returns true for valid publishers', async () => {
            const address = await client.getAddress()
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
            const address = await client.getAddress()
            expect(subscribers).toEqual([address.toLowerCase()])
        })
    })

    describe('isStreamSubscriber', () => {
        it('returns true for valid subscribers', async () => {
            const address = await client.getAddress()
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
        const INVALID_USER_IDS = [
            '',
            0,
            1,
            /regex/,
            {},
            false,
            true,
            Symbol('test'),
            function test() {},
            new Date(0),
            Infinity,
            Number.NaN,
            new Error('invalid')
            // null, undefined are the public user.
        ]

        it('Stream.getPermissions', async () => {
            const permissions = await createdStream.getPermissions()
            // get, edit, delete, subscribe, publish, share
            expect(permissions.length).toBe(6)
        })

        describe('Stream.hasPermission', () => {
            it('gets permission', async () => {
                expect(await createdStream.hasPermission(StreamOperation.STREAM_SHARE, wallet.address)).toBeTruthy()
                expect(await createdStream.hasPermission(StreamOperation.STREAM_SHARE, otherWallet.address)).not.toBeTruthy()
            })

            it('errors if invalid userId', async () => {
                for (const invalidId of INVALID_USER_IDS) {
                    // eslint-disable-next-line no-await-in-loop, no-loop-func
                    await expect(async () => {
                        // @ts-expect-error should require userId, this is part of the test
                        await createdStream.hasPermission(StreamOperation.STREAM_SHARE, invalidId)
                    }).rejects.toThrow()
                }
            })
        })

        describe('Stream.grantPermission', () => {
            it('creates public permissions when passed undefined', async () => {
                await createdStream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, undefined) // public read
                expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, undefined)).toBeTruthy()
            })

            it('creates user permissions when passed user id', async () => {
                await createdStream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, otherWallet.address) // user read
                expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, otherWallet.address)).toBeTruthy()
            })

            it('does not error if creating multiple permissions in parallel', async () => {
                await Promise.all([
                    createdStream.grantPermission(StreamOperation.STREAM_GET, otherWallet.address),
                    createdStream.grantPermission(StreamOperation.STREAM_SHARE, otherWallet.address),
                ])
                expect(await createdStream.hasPermission(StreamOperation.STREAM_GET, otherWallet.address)).toBeTruthy()
                expect(await createdStream.hasPermission(StreamOperation.STREAM_SHARE, otherWallet.address)).toBeTruthy()
            })

            it('does not error or create duplicates if creating multiple identical permissions in parallel', async () => {
                await createdStream.revokeAllUserPermissions(otherWallet.address)
                await Promise.all([
                    createdStream.grantPermission(StreamOperation.STREAM_GET, otherWallet.address),
                    createdStream.grantPermission(StreamOperation.STREAM_GET, otherWallet.address),
                    createdStream.grantPermission(StreamOperation.STREAM_GET, otherWallet.address),
                    createdStream.grantPermission(StreamOperation.STREAM_GET, otherWallet.address),
                ])
                expect(await createdStream.hasPermission(StreamOperation.STREAM_GET, otherWallet.address)).toBeTruthy()
                expect(await createdStream.getUserPermissions(otherWallet.address)).toHaveLength(1)
            })

            it('does not grant multiple permissions for same operation + user', async () => {
                const previousPermissions = await createdStream.getPermissions()
                await createdStream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, undefined) // public read
                const permissions = await createdStream.getPermissions()
                expect(permissions).toHaveLength(previousPermissions.length)
                expect(permissions).toEqual(previousPermissions)
            })

            it('errors if invalid userId', async () => {
                for (const invalidId of INVALID_USER_IDS) {
                    // eslint-disable-next-line no-await-in-loop, no-loop-func
                    await expect(async () => {
                        // @ts-expect-error should require userId, this is part of the test
                        await createdStream.grantPermission(StreamOperation.STREAM_SHARE, invalidId)
                    }).rejects.toThrow()
                }
            })
        })

        describe('Stream.revokePermission', () => {
            it('removes permission by id', async () => {
                const publicRead = await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, undefined)
                await createdStream.revokePermission(publicRead!.id)
                expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, undefined)).not.toBeTruthy()
            })

            it('does not error if not found', async () => {
                await createdStream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, undefined) // public read
                const publicRead = await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, undefined)
                await createdStream.revokePermission(publicRead!.id)
                await createdStream.revokePermission(publicRead!.id)
                expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, undefined)).not.toBeTruthy()
            })

            it('does not error if revoking multiple permissions in parallel', async () => {
                const p1 = await createdStream.grantPermission(StreamOperation.STREAM_GET, otherWallet.address)
                const p2 = await createdStream.grantPermission(StreamOperation.STREAM_SHARE, otherWallet.address)
                await Promise.all([
                    createdStream.revokePermission(p1.id),
                    createdStream.revokePermission(p1.id), // also try multiple of same id
                    createdStream.revokePermission(p2.id),
                    createdStream.revokePermission(p2.id),
                    createdStream.revokePermission(p2.id),
                ])
                expect(await createdStream.hasPermission(StreamOperation.STREAM_GET, otherWallet.address)).not.toBeTruthy()
                expect(await createdStream.hasPermission(StreamOperation.STREAM_SHARE, otherWallet.address)).not.toBeTruthy()
            })

            it('errors if invalid permission id', async () => {
                const INVALID_PERMISSION_IDS = [
                    '',
                    -1,
                    1.5,
                    /regex/,
                    {},
                    false,
                    true,
                    Symbol('test'),
                    function test() {},
                    new Date(0),
                    Infinity,
                    -Infinity,
                    Number.NaN,
                    new Error('invalid')
                ]

                for (const invalidId of INVALID_PERMISSION_IDS) {
                    // eslint-disable-next-line no-await-in-loop, no-loop-func
                    await expect(async () => {
                        // @ts-expect-error should require valid id, this is part of the test
                        await createdStream.revokePermission(invalidId)
                    }).rejects.toThrow()
                }
            })
        })

        describe('Stream.revokePublicPermission', () => {
            it('removes permission', async () => {
                await createdStream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, undefined)
                await createdStream.revokePublicPermission(StreamOperation.STREAM_SUBSCRIBE)
                expect(await createdStream.hasPublicPermission(StreamOperation.STREAM_SUBSCRIBE)).not.toBeTruthy()
            })
        })

        describe('Stream.revokeUserPermission', () => {
            it('removes permission', async () => {
                await createdStream.grantUserPermission(StreamOperation.STREAM_SUBSCRIBE, otherWallet.address)
                await createdStream.revokeUserPermission(StreamOperation.STREAM_SUBSCRIBE, otherWallet.address)
                expect(await createdStream.hasPublicPermission(StreamOperation.STREAM_SUBSCRIBE)).not.toBeTruthy()
            })

            it('fails if no user id provided', async () => {
                await expect(async () => {
                    // @ts-expect-error should require userId, this is part of the test
                    await createdStream.revokeUserPermission(StreamOperation.STREAM_SUBSCRIBE, undefined)
                }).rejects.toThrow()
            })
        })

        describe('Stream.grantUserPermission', () => {
            it('creates permission for user', async () => {
                await createdStream.revokeUserPermission(StreamOperation.STREAM_SUBSCRIBE, otherWallet.address)
                await createdStream.grantUserPermission(StreamOperation.STREAM_SUBSCRIBE, otherWallet.address) // public read
                expect(await createdStream.hasUserPermission(StreamOperation.STREAM_SUBSCRIBE, otherWallet.address)).toBeTruthy()
            })

            it('fails if no user id provided', async () => {
                await expect(async () => {
                    // @ts-expect-error should require userId, this is part of the test
                    await createdStream.grantUserPermission(StreamOperation.STREAM_SUBSCRIBE, undefined)
                }).rejects.toThrow()
            })
        })

        describe('Stream.{grant,revoke,has}UserPermissions', () => {
            it('creates & revokes permissions for user', async () => {
                await createdStream.revokeAllUserPermissions(otherWallet.address)
                expect(
                    await createdStream.hasUserPermissions([StreamOperation.STREAM_SUBSCRIBE, StreamOperation.STREAM_GET], otherWallet.address)
                ).not.toBeTruthy()

                await createdStream.grantUserPermissions([StreamOperation.STREAM_GET, StreamOperation.STREAM_SUBSCRIBE], otherWallet.address)

                expect(
                    await createdStream.hasUserPermissions([StreamOperation.STREAM_SUBSCRIBE, StreamOperation.STREAM_GET], otherWallet.address)
                ).toBeTruthy()

                // revoke permissions we just created
                await createdStream.revokeUserPermissions([StreamOperation.STREAM_GET, StreamOperation.STREAM_SUBSCRIBE], otherWallet.address)

                expect(
                    await createdStream.hasUserPermissions([StreamOperation.STREAM_SUBSCRIBE, StreamOperation.STREAM_GET], otherWallet.address)
                ).not.toBeTruthy()
            })

            it('fails if no user id provided', async () => {
                await expect(async () => {
                    // @ts-expect-error should require userId, this is part of the test
                    await createdStream.revokeUserPermissions([StreamOperation.STREAM_SUBSCRIBE], undefined)
                }).rejects.toThrow()
            })
        })

        describe('Stream.revokeAllUserPermissions', () => {
            it('revokes all user permissions', async () => {
                await createdStream.grantUserPermission(StreamOperation.STREAM_GET, otherWallet.address)
                await createdStream.grantUserPermission(StreamOperation.STREAM_SUBSCRIBE, otherWallet.address)
                expect((await createdStream.getUserPermissions(otherWallet.address)).length).toBeGreaterThanOrEqual(2)
                await createdStream.revokeAllUserPermissions(otherWallet.address)
                expect(await createdStream.getUserPermissions(otherWallet.address)).toHaveLength(0)
            })

            it('does not fail if called twice', async () => {
                await createdStream.revokeAllUserPermissions(otherWallet.address)
                await createdStream.revokeAllUserPermissions(otherWallet.address)
            })

            it('fails if no user id provided', async () => {
                await expect(async () => {
                    // @ts-expect-error should require userId, this is part of the test
                    await createdStream.revokeAllUserPermissions(undefined)
                }).rejects.toThrow()
            })
        })

        describe('Stream.revokeAllPublicPermissions', () => {
            it('revokes all public permissions', async () => {
                await createdStream.grantPublicPermission(StreamOperation.STREAM_GET)
                await createdStream.grantPublicPermission(StreamOperation.STREAM_SUBSCRIBE)
                expect((await createdStream.getPublicPermissions()).length).toBeGreaterThanOrEqual(2)
                await createdStream.revokeAllPublicPermissions()
                expect(await createdStream.getPublicPermissions()).toHaveLength(0)
            })

            it('does not fail if called twice', async () => {
                await createdStream.getPublicPermissions()
                await createdStream.getPublicPermissions()
            })
        })
    })

    describe('Stream deletion', () => {
        it('Stream.delete', async () => {
            await createdStream.delete()
            return expect(() => client.getStream(createdStream.id)).rejects.toThrow(NotFoundError)
        })

        it('does not throw if already deleted', async () => {
            await createdStream.delete()
            await createdStream.delete()
        })
    })

    describe('Storage node assignment', () => {
        it('add', async () => {
            const stream = await createTestStream(client, module)
            const storageNode = StorageNode.STREAMR_DOCKER_DEV
            await stream.addToStorageNode(storageNode)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes.length).toBe(1)
            expect(storageNodes[0].address).toBe(storageNode)
            const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
            expect(storedStreamParts.some(
                (sp) => (sp.streamId === stream.id) && (sp.streamPartition === 0)
            )).toBeTruthy()
        })

        it('remove', async () => {
            const storageNode = StorageNode.STREAMR_DOCKER_DEV
            const stream = await createTestStream(client, module)
            await stream.addToStorageNode(storageNode)
            await stream.removeFromStorageNode(storageNode)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes).toHaveLength(0)
            const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
            expect(storedStreamParts.some(
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
