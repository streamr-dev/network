import { Wallet } from 'ethers'

import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { hexToBinary } from '@streamr/utils'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { createRelativeTestStreamId, randomUserId } from '../test-utils/utils'

const TIMEOUT = 40000

describe('Stream permissions', () => {

    let client: StreamrClient
    let stream: Stream
    let otherUser: Wallet

    beforeAll(async () => {
        const wallet = new Wallet(await fetchPrivateKeyWithGas())
        otherUser = fastWallet()
        client = new StreamrClient({
            ...CONFIG_TEST,
            auth: {
                privateKey: wallet.privateKey,
            }
        })
    }, TIMEOUT)

    afterAll(async () => {
        await client?.destroy()
    })

    beforeEach(async () => {
        stream = await client.createStream({
            id: createRelativeTestStreamId(module)
        })
    }, TIMEOUT)

    describe('happy path', () => {
        it('direct permissions', async () => {
            await stream.grantPermissions({
                user: hexToBinary(otherUser.address),
                permissions: [StreamPermission.PUBLISH, StreamPermission.EDIT],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: hexToBinary(otherUser.address),
                allowPublic: false
            })).toBe(true)
            expect(await stream.hasPermission({
                permission: StreamPermission.EDIT,
                user: hexToBinary(otherUser.address),
                allowPublic: false
            })).toBe(true)
            await stream.revokePermissions({
                user: hexToBinary(otherUser.address),
                permissions: [StreamPermission.PUBLISH, StreamPermission.EDIT],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: hexToBinary(otherUser.address),
                allowPublic: false
            })).toBe(false)
            expect(await stream.hasPermission({
                permission: StreamPermission.EDIT,
                user: hexToBinary(otherUser.address),
                allowPublic: false
            })).toBe(false)
        }, TIMEOUT)

        it('public permissions', async () => {
            await stream.grantPermissions({
                public: true,
                permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: hexToBinary(otherUser.address),
                allowPublic: true
            })).toBe(true)
            expect(await stream.hasPermission({
                permission: StreamPermission.SUBSCRIBE,
                user: hexToBinary(otherUser.address),
                allowPublic: true
            })).toBe(true)
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: hexToBinary(otherUser.address),
                allowPublic: false
            })).toBe(false)
            expect(await stream.hasPermission({
                permission: StreamPermission.SUBSCRIBE,
                user: hexToBinary(otherUser.address),
                allowPublic: false
            })).toBe(false)
            await stream.revokePermissions({
                public: true,
                permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: hexToBinary(otherUser.address),
                allowPublic: true
            })).toBe(false)
            expect(await stream.hasPermission({
                permission: StreamPermission.SUBSCRIBE,
                user: hexToBinary(otherUser.address),
                allowPublic: true
            })).toBe(false)
        }, TIMEOUT)
    })

    it('get permissions', async () => {
        await stream.grantPermissions({ public: true, permissions: [StreamPermission.PUBLISH] })
        const permissions = await stream.getPermissions()
        const owner = await client.getUserId()
        return expect(permissions).toIncludeSameMembers([{
            user: expect.toEqualBinary(owner),
            permissions: [
                StreamPermission.EDIT,
                StreamPermission.DELETE,
                StreamPermission.PUBLISH,
                StreamPermission.SUBSCRIBE,
                StreamPermission.GRANT
            ]
        }, {
            public: true,
            permissions: [StreamPermission.PUBLISH]
        }])
    }, TIMEOUT)

    it('no permissions initially for other users', async () => {
        expect(await stream.hasPermission({
            user: hexToBinary(otherUser.address),
            permission: StreamPermission.SUBSCRIBE,
            allowPublic: false
        })).toBe(false)
        expect(await stream.hasPermission({
            public: true,
            permission: StreamPermission.SUBSCRIBE
        })).toBe(false)
    }, TIMEOUT)

    it('can revoke non-existing permissions', async () => {
        await stream.revokePermissions({
            user: hexToBinary(otherUser.address),
            permissions: [StreamPermission.SUBSCRIBE]
        })
        await stream.revokePermissions({
            public: true,
            permissions: [StreamPermission.SUBSCRIBE]
        })
    }, TIMEOUT)

    it('set permissions', async () => {
        const otherStream = await client.createStream({
            id: createRelativeTestStreamId(module)
        })
        const user1 = randomUserId()
        const user2 = randomUserId()
        await stream.grantPermissions({
            user: user1,
            permissions: [StreamPermission.GRANT]
        })
        await stream.grantPermissions({
            user: user2,
            permissions: [StreamPermission.EDIT]
        })
        await client.setPermissions({
            streamId: stream.id,
            assignments: [
                {
                    user: user1,
                    permissions: [StreamPermission.SUBSCRIBE]
                }, {
                    user: user2,
                    permissions: []
                }
            ]
        }, {
            streamId: otherStream.id,
            assignments: [
                {
                    public: true,
                    permissions: [StreamPermission.PUBLISH]
                }
            ]
        })
        expect(await stream.hasPermission({ permission: StreamPermission.SUBSCRIBE, allowPublic: false, user: user1 })).toBe(true)
        expect(await stream.hasPermission({ permission: StreamPermission.GRANT, allowPublic: false, user: user1 })).toBe(false)
        expect(await stream.hasPermission({ permission: StreamPermission.SUBSCRIBE, allowPublic: false, user: user2 })).toBe(false)
        expect(await stream.hasPermission({ permission: StreamPermission.EDIT, allowPublic: false, user: user2 })).toBe(false)
        expect(await otherStream.hasPermission(
            { permission: StreamPermission.PUBLISH, allowPublic: true, user: randomUserId() }
        )).toBe(true)
    }, TIMEOUT)

    it('grant same permission multiple times', async () => {
        await stream.grantPermissions({
            user: hexToBinary(otherUser.address),
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const previousPermissions = await stream.getPermissions()
        await stream.grantPermissions({
            user: hexToBinary(otherUser.address),
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const permissions = await stream.getPermissions()
        expect(permissions).toEqual(previousPermissions)
    }, TIMEOUT)

    it('granting publish permission enables publishing (invalidates isStreamPublisher cache)', async () => {
        const otherUserClient = new StreamrClient({
            ...CONFIG_TEST,
            auth: {
                privateKey: otherUser.privateKey,
            }
        }) 
        const message = {
            foo: Date.now()
        }
        const errorSnippet = `You don't have permission to publish to this stream. Using address: ${otherUser.address.toLowerCase()}`
        await expect(() => otherUserClient.publish(stream.id, message)).rejects.toThrow(errorSnippet)
        await client.grantPermissions(stream.id, {
            user: hexToBinary(otherUser.address),
            permissions: [StreamPermission.PUBLISH]
        })
        await expect(otherUserClient.publish(stream.id, message)).resolves.toBeDefined()
        await otherUserClient.destroy()
    }, TIMEOUT)
})
