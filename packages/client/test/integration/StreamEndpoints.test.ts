import { Wallet } from 'ethers'

import { clientOptions, createTestStream, until, createRelativeTestStreamId, fetchPrivateKeyWithGas } from '../utils'
import { NotFoundError } from '../../src/authFetch'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream, StreamPermission } from '../../src/Stream'
import { DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { StreamPartIDUtils, toStreamID, toStreamPartID } from 'streamr-client-protocol'
import { collect } from '../../src/utils/GeneratorUtils'
import { randomEthereumAddress } from 'streamr-test-utils'

jest.setTimeout(40000)

/**
 * These tests should be run in sequential order!
 */
describe('StreamEndpoints', () => {

    let client: StreamrClient
    let wallet: Wallet
    let createdStream: Stream
    let otherWallet: Wallet

    beforeAll(async () => {
        wallet = new Wallet(await fetchPrivateKeyWithGas())
        otherWallet = new Wallet(await fetchPrivateKeyWithGas())
        client = new StreamrClient({
            ...clientOptions,
            auth: {
                privateKey: wallet.privateKey,
            },
        })
    })

    beforeAll(async () => {
        createdStream = await createTestStream(client, module, {
            requireSignedData: true
        })
    })

    describe('createStream', () => {
        it('creates a stream with correct values', async () => {
            const path = await createRelativeTestStreamId(module)
            const stream = await client.createStream({
                id: path,
                requireSignedData: true
            })
            await until(async () => { return client.streamExistsOnTheGraph(stream.id) }, 100000, 1000)
            expect(stream.id).toBe(toStreamID(path, await client.getAddress()))
            expect(stream.requireSignedData).toBe(true)
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

        it('legacy format', async () => {
            const streamId = '7wa7APtlTq6EC5iTCBy6dw'
            await expect(async () => client.createStream({ id: streamId })).rejects.toThrow(`stream id "${streamId}" not valid`)
        })

        it('key-exchange format', async () => {
            const streamId = 'SYSTEM/keyexchange/0x0000000000000000000000000000000000000000'
            await expect(async () => client.createStream({ id: streamId })).rejects.toThrow(`stream id "${streamId}" not valid`)
        })

        describe('ENS', () => {

            it('domain owned by user', async () => {
                const streamId = 'testdomain1.eth/foobar/' + Date.now()
                const ensOwnerClient = new StreamrClient({
                    ...clientOptions,
                    auth: {
                        // In dev environment the testdomain1.eth is owned by 0x4178baBE9E5148c6D5fd431cD72884B07Ad855a0.
                        // The ownership is preloaded by docker-dev-chain-init (https://github.com/streamr-dev/network-contracts)
                        privateKey: '0xe5af7834455b7239881b85be89d905d6881dcb4751063897f12be1b0dd546bdb'
                    },
                })
                const newStream = await ensOwnerClient.createStream({
                    id: streamId,
                })
                await until(async () => { return ensOwnerClient.streamExistsOnTheGraph(streamId) }, 100000, 1000)
                expect(newStream.id).toEqual(streamId)
            })

            it('domain not owned by user', async () => {
                const streamId = 'testdomain1.eth/foobar'
                await expect(async () => client.createStream({ id: streamId })).rejects.toThrow()
            })

            it('domain not registered', async () => {
                const streamId = 'some-non-registered-address.eth/foobar'
                await expect(async () => client.createStream({ id: streamId })).rejects.toThrow()
            })

        })
    })

    describe('getStream', () => {
        it('get an existing Stream', async () => {
            const stream = await createTestStream(client, module)
            const existingStream = await client.getStream(stream.id)
            expect(existingStream.id).toEqual(stream.id)
        })

        it('get a non-existing Stream', async () => {
            const streamId = `${wallet.address.toLowerCase()}/StreamEndpoints-nonexisting-${Date.now()}`
            return expect(() => client.getStream(streamId)).rejects.toThrow(NotFoundError)
        })
    })

    describe('getOrCreate', () => {
        it('existing Stream by id', async () => {
            const existingStream = await client.getOrCreateStream({
                id: createdStream.id,
            })
            expect(existingStream.id).toBe(createdStream.id)
        })

        it('new Stream by id', async () => {
            const newId = `${wallet.address.toLowerCase()}/StreamEndpoints-getOrCreate-newId-${Date.now()}`
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
            const otherAddress = randomEthereumAddress()
            const newPath = `/StreamEndpoints-getOrCreate-newPath-${Date.now()}`
            // backend should error
            await expect(async () => {
                await client.getOrCreateStream({
                    id: `${otherAddress}${newPath}`,
                })
            }).rejects.toThrow(`stream id "${otherAddress}${newPath}" not in namespace of authenticated user "${wallet.address.toLowerCase()}"`)
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
                id: await createRelativeTestStreamId(module),
            })
            await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
            const result = await client.getStreamLast(stream.id)
            expect(result).toEqual([])
        })
    })

    describe('getStreamPublishers', () => {
        it('retrieves a list of publishers', async () => {
            const publishers = await collect(client.getStreamPublishers(createdStream.id))
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
            const valid = await client.isStreamPublisher(createdStream.id, randomEthereumAddress())
            return expect(!valid).toBeTruthy()
        })
    })

    describe('getStreamSubscribers', () => {
        it('retrieves a list of subscribers', async () => {
            const subscribers = await collect(client.getStreamSubscribers(createdStream.id))
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
            const valid = await client.isStreamSubscriber(createdStream.id, randomEthereumAddress())
            return expect(!valid).toBeTruthy()
        })
    })

    describe('Stream.update', () => {
        it('can change stream description', async () => {
            createdStream.description = `description-${Date.now()}`
            await createdStream.update()
            await until(async () => {
                try {
                    return (await client.getStream(createdStream.id)).description === createdStream.description
                } catch (err) {
                    return false
                }
            }, 100000, 1000)
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

        // TODO: fix flaky test in NET-653 / NET-606
        it.skip('Stream.getPermissions', async () => {
            const stream = await createTestStream(client, module)
            await stream.grantPublicPermission(StreamPermission.PUBLISH)
            const permissions = await stream.getPermissions()
            return expect(permissions).toEqual({
                [wallet.address.toLowerCase()]: [
                    StreamPermission.EDIT,
                    StreamPermission.DELETE,
                    StreamPermission.PUBLISH,
                    StreamPermission.SUBSCRIBE,
                    StreamPermission.GRANT
                ],
                public: [StreamPermission.PUBLISH]
            })
        })

        describe('Stream.hasPermission', () => {
            it('gets permission', async () => {
                expect(await createdStream.hasUserPermission(StreamPermission.GRANT, wallet.address)).toBeTruthy()
                expect(await createdStream.hasUserPermission(StreamPermission.GRANT, otherWallet.address)).not.toBeTruthy()
            })

            it('errors if invalid userId', async () => {
                for (const invalidId of INVALID_USER_IDS) {
                    // eslint-disable-next-line no-await-in-loop, no-loop-func
                    await expect(async () => {
                        // @ts-expect-error should require userId, this is part of the test
                        await createdStream.hasUserPermission(StreamPermission.GRANT, invalidId)
                    }).rejects.toThrow()
                }
            })
        })

        describe('Stream.grantPermission', () => {
            it('creates public permissions when passed undefined', async () => {
                await createdStream.grantPublicPermission(StreamPermission.SUBSCRIBE) // public read
                expect(await createdStream.hasPublicPermission(StreamPermission.SUBSCRIBE)).toBeTruthy()
            })

            it('creates user permissions when passed user id', async () => {
                await createdStream.grantUserPermission(StreamPermission.SUBSCRIBE, otherWallet.address) // user read
                expect(await createdStream.hasUserPermission(StreamPermission.SUBSCRIBE, otherWallet.address)).toBeTruthy()
            })

            it('sets Permissions for multiple users in one transaction', async () => {
                const userA = randomEthereumAddress()
                const userB = randomEthereumAddress()
                const permissionA = {
                    canEdit: true,
                    canDelete: true,
                    canPublish: true,
                    canSubscribe: true,
                    canGrant: true
                }
                const permissionB = {
                    canEdit: false,
                    canDelete: false,
                    canSubscribe: false,
                    canPublish: false,
                    canGrant: false
                }

                await createdStream.setPermissions([userA, userB], [permissionA, permissionB]) // user read
                expect(await createdStream.hasUserPermission(StreamPermission.SUBSCRIBE, otherWallet.address)).toBeTruthy()
            })

            // it('does not error if creating multiple permissions in parallel', async () => {
            //     await Promise.all([
            //         createdStream.grantUserPermission(StreamPermission.SHARE, otherWallet.address),
            //     ])
            //     expect(await createdStream.hasUserPermission(StreamPermission.SHARE, otherWallet.address)).toBeTruthy()
            // })

            // it('does not error or create duplicates if creating multiple identical permissions in parallel', async () => {
            //     await createdStream.revokeAllUserPermissions(otherWallet.address)
            //     await Promise.all([
            //         createdStream.grantUserPermission(StreamPermission.PUBLISH, otherWallet.address),
            //         createdStream.grantUserPermission(StreamPermission.PUBLISH, otherWallet.address),
            //         createdStream.grantUserPermission(StreamPermission.PUBLISH, otherWallet.address),
            //         createdStream.grantUserPermission(StreamPermission.PUBLISH, otherWallet.address),
            //     ])
            //     expect(await createdStream.hasUserPermission(StreamPermission.PUBLISH, otherWallet.address)).toBeTruthy()
            //     expect(await createdStream.getUserPermissions(otherWallet.address)).toHaveLength(1)
            // })

            it('does not grant multiple permissions for same permission + user', async () => {
                await createdStream.grantPublicPermission(StreamPermission.SUBSCRIBE) // public read
                const previousPermissions = await createdStream.getPermissions()
                await createdStream.grantPublicPermission(StreamPermission.SUBSCRIBE) // public read
                const permissions = await createdStream.getPermissions()
                expect(permissions).toEqual(previousPermissions)
            })

            it('errors if invalid userId', async () => {
                for (const invalidId of INVALID_USER_IDS) {
                    // eslint-disable-next-line no-await-in-loop, no-loop-func
                    await expect(async () => {
                        // @ts-expect-error should require userId, this is part of the test
                        await createdStream.grantUserPermission(StreamPermission.GRANT, invalidId)
                    }).rejects.toThrow()
                }
            })
        })

        describe('Stream.revokePermission', () => {
        //     it('removes permission by id', async () => {
        //         const publicRead = await createdStream.hasPublicPermission(StreamPermission.SUBSCRIBE)
        //         await createdStream.revokeUserPermission(publicRead!.id)
        //         expect(await createdStream.hasPublicPermission(StreamPermission.SUBSCRIBE)).not.toBeTruthy()
        //     })

            it('does not error if not found', async () => {
                await createdStream.grantPublicPermission(StreamPermission.SUBSCRIBE) // public read
                await createdStream.hasPublicPermission(StreamPermission.SUBSCRIBE)
                await createdStream.revokePublicPermission(StreamPermission.SUBSCRIBE)
                expect(await createdStream.hasPublicPermission(StreamPermission.SUBSCRIBE)).not.toBeTruthy()
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
                        await createdStream.revokeUserPermission(invalidId)
                    }).rejects.toThrow()
                }
            })
        })

        // describe('Stream.revokePublicPermission', () => {
        //     it('removes permission', async () => {
        //         await createdStream.grantUserPermission(StreamPermission.SUBSCRIBE)
        //         await createdStream.revokePublicPermission(StreamPermission.SUBSCRIBE)
        //         expect(await createdStream.hasPublicPermission(StreamPermission.SUBSCRIBE)).not.toBeTruthy()
        //     })
        // })

        describe('Stream.revokeUserPermission', () => {
            it('removes permission', async () => {
                await createdStream.grantUserPermission(StreamPermission.SUBSCRIBE, otherWallet.address)
                await createdStream.revokeUserPermission(StreamPermission.SUBSCRIBE, otherWallet.address)
                expect(await createdStream.hasPublicPermission(StreamPermission.SUBSCRIBE)).not.toBeTruthy()
            })

            it('fails if no user id provided', async () => {
                await expect(async () => {
                    // @ts-expect-error should require userId, this is part of the test
                    await createdStream.revokeUserPermission(StreamPermission.SUBSCRIBE, undefined)
                }).rejects.toThrow()
            })
        })

        describe('Stream.grantUserPermission', () => {
            it('creates permission for user', async () => {
                await createdStream.revokeUserPermission(StreamPermission.SUBSCRIBE, otherWallet.address)
                await createdStream.grantUserPermission(StreamPermission.SUBSCRIBE, otherWallet.address) // public read
                expect(await createdStream.hasUserPermission(StreamPermission.SUBSCRIBE, otherWallet.address)).toBeTruthy()
            })

            it('fails if no user id provided', async () => {
                await expect(async () => {
                    // @ts-expect-error should require userId, this is part of the test
                    await createdStream.grantUserPermission(StreamPermission.SUBSCRIBE, undefined)
                }).rejects.toThrow()
            })
        })

        describe('Stream.{grant,revoke,has}UserPermissions', () => {
            // it('creates & revokes permissions for user', async () => {
            //     await createdStream.revokeAllUserPermissions(otherWallet.address)
            //     expect(
            //         await createdStream.hasUserPermissions([StreamPermission.SUBSCRIBE, StreamPermission.GET], otherWallet.address)
            //     ).not.toBeTruthy()

            //     await createdStream.grantUserPermissions([StreamPermission.GET, StreamPermission.SUBSCRIBE], otherWallet.address)

            //     expect(
            //         await createdStream.hasUserPermissions([StreamPermission.SUBSCRIBE, StreamPermission.GET], otherWallet.address)
            //     ).toBeTruthy()

            //     // revoke permissions we just created
            //     await createdStream.revokeUserPermissions([StreamPermission.GET, StreamPermission.SUBSCRIBE], otherWallet.address)

            //     expect(
            //         await createdStream.hasUserPermissions([StreamPermission.SUBSCRIBE, StreamPermission.GET], otherWallet.address)
            //     ).not.toBeTruthy()
            // })

            it('fails if no user id provided', async () => {
                await expect(async () => {
                    // @ts-expect-error should require userId, this is part of the test
                    await createdStream.revokeUserPermissions([StreamPermission.SUBSCRIBE], undefined)
                }).rejects.toThrow()
            })
        })

        describe('Stream.revokeAllUserPermissions', () => {
            it('revokes all user permissions', async () => {
                await createdStream.grantUserPermission(StreamPermission.SUBSCRIBE, otherWallet.address)
                expect((await createdStream.getUserPermissions(otherWallet.address)).canSubscribe).toBe(true)
                await createdStream.revokeAllUserPermissions(otherWallet.address)
                expect(await createdStream.getUserPermissions(otherWallet.address)).toEqual(
                    {
                        canDelete: false,
                        canEdit: false,
                        canPublish: false,
                        canGrant: false,
                        canSubscribe: false
                    }
                )
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
                await createdStream.grantPublicPermission(StreamPermission.SUBSCRIBE)
                expect((await createdStream.getPublicPermissions()).canSubscribe).toBe(true)
                await createdStream.revokeAllPublicPermissions()
                expect(await createdStream.getPublicPermissions()).toEqual(
                    {
                        canDelete: false,
                        canEdit: false,
                        canPublish: false,
                        canGrant: false,
                        canSubscribe: false
                    }
                )
            })

            it('does not fail if called twice', async () => {
                await createdStream.getPublicPermissions()
                await createdStream.getPublicPermissions()
            })
        })
    })

    describe('Stream deletion', () => {
        it('Stream.delete', async () => {
            const props = { id: await createRelativeTestStreamId(module) }
            const stream = await client.createStream(props)
            await until(() => client.streamExistsOnTheGraph(stream.id), 100000, 1000)
            await stream.delete()
            await until(async () => {
                try {
                    await client.getStream(stream.id)
                    return false
                } catch (err: any) {
                    return err.errorCode === 'NOT_FOUND'
                }
            }, 100000, 1000)
            expect(await client.streamExistsOnChain(stream.id)).toEqual(false)
            return expect(client.getStream(stream.id)).rejects.toThrow()
        })

        // it('does not throw if already deleted', async () => {
        //     await createdStream.delete()
        //     await createdStream.delete()
        // })
    })

    describe('Storage node assignment', () => {
        it('add', async () => {
            // await stream.addToStorageNode(node.getAddress())// use actual storage nodes Address, actually register it
            const stream = await createTestStream(client, module)
            await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes.length).toBe(1)
            expect(storageNodes[0]).toStrictEqual(DOCKER_DEV_STORAGE_NODE.toLowerCase())
            const storedStreamParts = await client.getStreamPartsByStorageNode(DOCKER_DEV_STORAGE_NODE)
            const expectedStreamPartId = toStreamPartID(stream.id, 0)
            return expect(storedStreamParts.some((sp) => sp === expectedStreamPartId)).toBeTruthy()
        })

        it('remove', async () => {
            const stream = await createTestStream(client, module)
            await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
            await stream.removeFromStorageNode(DOCKER_DEV_STORAGE_NODE)
            await until(async () => { return !(await client.isStreamStoredInStorageNode(stream.id, DOCKER_DEV_STORAGE_NODE)) }, 100000, 1000)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes).toHaveLength(0)
            const storedStreamParts = await client.getStreamPartsByStorageNode(DOCKER_DEV_STORAGE_NODE)
            return expect(storedStreamParts.some((sp) => (StreamPartIDUtils.getStreamID(sp) === stream.id))).toBeFalsy()
        })
    })
})
