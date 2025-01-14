import { fastWallet, fetchPrivateKeyWithGas, randomUserId } from '@streamr/test-utils'
import { toUserId } from '@streamr/utils'
import { randomBytes } from 'crypto'
import { Wallet } from 'ethers'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { createRelativeTestStreamId } from '../test-utils/utils'

const TIMEOUT = 40000

describe('Stream permissions', () => {
    let client: StreamrClient
    let stream: Stream
    let otherUser: Wallet

    beforeAll(async () => {
        const wallet = new Wallet(await fetchPrivateKeyWithGas())
        otherUser = fastWallet()
        client = new StreamrClient({
            environment: 'dev2',
            auth: {
                privateKey: wallet.privateKey
            }
        })
    }, TIMEOUT)

    afterAll(async () => {
        await client.destroy()
    })

    beforeEach(async () => {
        stream = await client.createStream({
            id: createRelativeTestStreamId(module)
        })
    }, TIMEOUT)

    describe('happy path', () => {
        it(
            'direct permissions',
            async () => {
                await stream.grantPermissions({
                    userId: otherUser.address,
                    permissions: [StreamPermission.PUBLISH, StreamPermission.EDIT]
                })
                expect(
                    await stream.hasPermission({
                        permission: StreamPermission.PUBLISH,
                        userId: otherUser.address,
                        allowPublic: false
                    })
                ).toBe(true)
                expect(
                    await stream.hasPermission({
                        permission: StreamPermission.EDIT,
                        userId: otherUser.address,
                        allowPublic: false
                    })
                ).toBe(true)
                await stream.revokePermissions({
                    userId: otherUser.address,
                    permissions: [StreamPermission.PUBLISH, StreamPermission.EDIT]
                })
                expect(
                    await stream.hasPermission({
                        permission: StreamPermission.PUBLISH,
                        userId: otherUser.address,
                        allowPublic: false
                    })
                ).toBe(false)
                expect(
                    await stream.hasPermission({
                        permission: StreamPermission.EDIT,
                        userId: otherUser.address,
                        allowPublic: false
                    })
                ).toBe(false)
            },
            TIMEOUT
        )

        it(
            'public permissions',
            async () => {
                await stream.grantPermissions({
                    public: true,
                    permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE]
                })
                expect(
                    await stream.hasPermission({
                        permission: StreamPermission.PUBLISH,
                        userId: otherUser.address,
                        allowPublic: true
                    })
                ).toBe(true)
                expect(
                    await stream.hasPermission({
                        permission: StreamPermission.SUBSCRIBE,
                        userId: otherUser.address,
                        allowPublic: true
                    })
                ).toBe(true)
                expect(
                    await stream.hasPermission({
                        permission: StreamPermission.PUBLISH,
                        userId: otherUser.address,
                        allowPublic: false
                    })
                ).toBe(false)
                expect(
                    await stream.hasPermission({
                        permission: StreamPermission.SUBSCRIBE,
                        userId: otherUser.address,
                        allowPublic: false
                    })
                ).toBe(false)
                await stream.revokePermissions({
                    public: true,
                    permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE]
                })
                expect(
                    await stream.hasPermission({
                        permission: StreamPermission.PUBLISH,
                        userId: otherUser.address,
                        allowPublic: true
                    })
                ).toBe(false)
                expect(
                    await stream.hasPermission({
                        permission: StreamPermission.SUBSCRIBE,
                        userId: otherUser.address,
                        allowPublic: true
                    })
                ).toBe(false)
            },
            TIMEOUT
        )
    })

    it(
        'get permissions',
        async () => {
            await stream.grantPermissions({ public: true, permissions: [StreamPermission.PUBLISH] })
            const permissions = await stream.getPermissions()
            const owner = await client.getUserId()
            expect(permissions).toIncludeSameMembers([
                {
                    userId: owner,
                    permissions: [
                        StreamPermission.EDIT,
                        StreamPermission.DELETE,
                        StreamPermission.PUBLISH,
                        StreamPermission.SUBSCRIBE,
                        StreamPermission.GRANT
                    ]
                },
                {
                    public: true,
                    permissions: [StreamPermission.PUBLISH]
                }
            ])
        },
        TIMEOUT
    )

    it(
        'no permissions initially for other users',
        async () => {
            expect(
                await stream.hasPermission({
                    userId: otherUser.address,
                    permission: StreamPermission.SUBSCRIBE,
                    allowPublic: false
                })
            ).toBe(false)
            expect(
                await stream.hasPermission({
                    public: true,
                    permission: StreamPermission.SUBSCRIBE
                })
            ).toBe(false)
        },
        TIMEOUT
    )

    it(
        'can revoke non-existing permissions',
        async () => {
            await stream.revokePermissions({
                userId: otherUser.address,
                permissions: [StreamPermission.SUBSCRIBE]
            })
            await stream.revokePermissions({
                public: true,
                permissions: [StreamPermission.SUBSCRIBE]
            })
        },
        TIMEOUT
    )

    it(
        'set permissions',
        async () => {
            const otherStream = await client.createStream({
                id: createRelativeTestStreamId(module)
            })
            const user1 = randomUserId()
            const user2 = randomUserId()
            await stream.grantPermissions({
                userId: user1,
                permissions: [StreamPermission.PUBLISH]
            })
            await stream.grantPermissions({
                userId: user2,
                permissions: [StreamPermission.SUBSCRIBE]
            })
            await client.setPermissions(
                {
                    streamId: stream.id,
                    assignments: [
                        {
                            userId: user1,
                            permissions: [StreamPermission.SUBSCRIBE]
                        },
                        {
                            userId: user2,
                            permissions: []
                        }
                    ]
                },
                {
                    streamId: otherStream.id,
                    assignments: [
                        {
                            public: true,
                            permissions: [StreamPermission.PUBLISH]
                        }
                    ]
                }
            )
            expect(
                await stream.hasPermission({ permission: StreamPermission.PUBLISH, allowPublic: false, userId: user1 })
            ).toBe(false)
            expect(
                await stream.hasPermission({
                    permission: StreamPermission.SUBSCRIBE,
                    allowPublic: false,
                    userId: user1
                })
            ).toBe(true)
            expect(
                await stream.hasPermission({ permission: StreamPermission.PUBLISH, allowPublic: false, userId: user2 })
            ).toBe(false)
            expect(
                await stream.hasPermission({
                    permission: StreamPermission.SUBSCRIBE,
                    allowPublic: false,
                    userId: user2
                })
            ).toBe(false)
            expect(
                await otherStream.hasPermission({
                    permission: StreamPermission.PUBLISH,
                    allowPublic: true,
                    userId: randomUserId()
                })
            ).toBe(true)
        },
        TIMEOUT
    )

    it(
        'grant same permission multiple times',
        async () => {
            await stream.grantPermissions({
                userId: otherUser.address,
                permissions: [StreamPermission.SUBSCRIBE]
            })
            const previousPermissions = await stream.getPermissions()
            await stream.grantPermissions({
                userId: otherUser.address,
                permissions: [StreamPermission.SUBSCRIBE]
            })
            const permissions = await stream.getPermissions()
            expect(permissions).toEqual(previousPermissions)
        },
        TIMEOUT
    )

    it(
        'granting publish permission enables publishing (invalidates isStreamPublisher cache)',
        async () => {
            const otherUserClient = new StreamrClient({
                environment: 'dev2',
                auth: {
                    privateKey: otherUser.privateKey
                }
            })
            const message = {
                foo: Date.now()
            }
            const errorSnippet = `You don't have permission to publish to this stream. Using address: ${toUserId(otherUser.address)}`
            await expect(() => otherUserClient.publish(stream.id, message)).rejects.toThrow(errorSnippet)
            await client.grantPermissions(stream.id, {
                userId: otherUser.address,
                permissions: [StreamPermission.PUBLISH]
            })
            await expect(otherUserClient.publish(stream.id, message)).resolves.toBeDefined()
            await otherUserClient.destroy()
        },
        TIMEOUT
    )

    describe('validation', () => {
        it('unsupported type for public permission', async () => {
            await expect(() =>
                client.grantPermissions(stream.id, {
                    public: true,
                    permissions: [StreamPermission.PUBLISH, StreamPermission.GRANT]
                })
            ).rejects.toThrowStreamrClientError({
                message: 'Public permission is not supported for permission types: GRANT',
                code: 'UNSUPPORTED_OPERATION'
            })
        })

        it('unsupported type for non-Ethereum user', async () => {
            await expect(() =>
                client.grantPermissions(stream.id, {
                    userId: toUserId(randomBytes(50)),
                    permissions: [StreamPermission.EDIT, StreamPermission.GRANT]
                })
            ).rejects.toThrowStreamrClientError({
                message: 'Non-Ethereum user id is not supported for permission types: EDIT, GRANT',
                code: 'UNSUPPORTED_OPERATION'
            })
        })
    })
})
