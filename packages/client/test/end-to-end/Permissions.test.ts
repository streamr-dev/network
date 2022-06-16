import { Wallet } from 'ethers'

import { createRelativeTestStreamId, fetchPrivateKeyWithGas } from '../test-utils/utils'
import { ConfigTest } from '../../src/ConfigTest'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { fastWallet, randomEthereumAddress } from 'streamr-test-utils'

jest.setTimeout(40000)

describe('Stream permissions', () => {

    let client: StreamrClient
    let stream: Stream
    let otherUser: Wallet

    beforeAll(async () => {
        const wallet = new Wallet(await fetchPrivateKeyWithGas())
        otherUser = fastWallet()
        client = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: wallet.privateKey,
            }
        })
    })

    afterAll(async () => {
        await client?.destroy()
    })

    beforeEach(async () => {
        stream = await client.createStream({
            id: createRelativeTestStreamId(module)
        })
    })

    describe('happy path', () => {
        it('direct permissions', async () => {
            await stream.grantPermissions({
                user: otherUser.address,
                permissions: [StreamPermission.PUBLISH, StreamPermission.EDIT],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: otherUser.address,
                allowPublic: false
            })).toBe(true)
            expect(await stream.hasPermission({
                permission: StreamPermission.EDIT,
                user: otherUser.address,
                allowPublic: false
            })).toBe(true)
            await stream.revokePermissions({
                user: otherUser.address,
                permissions: [StreamPermission.PUBLISH, StreamPermission.EDIT],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: otherUser.address,
                allowPublic: false
            })).toBe(false)
            expect(await stream.hasPermission({
                permission: StreamPermission.EDIT,
                user: otherUser.address,
                allowPublic: false
            })).toBe(false)
        })

        it('public permissions', async () => {
            await stream.grantPermissions({
                public: true,
                permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: otherUser.address,
                allowPublic: true
            })).toBe(true)
            expect(await stream.hasPermission({
                permission: StreamPermission.SUBSCRIBE,
                user: otherUser.address,
                allowPublic: true
            })).toBe(true)
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: otherUser.address,
                allowPublic: false
            })).toBe(false)
            expect(await stream.hasPermission({
                permission: StreamPermission.SUBSCRIBE,
                user: otherUser.address,
                allowPublic: false
            })).toBe(false)
            await stream.revokePermissions({
                public: true,
                permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: otherUser.address,
                allowPublic: true
            })).toBe(false)
            expect(await stream.hasPermission({
                permission: StreamPermission.SUBSCRIBE,
                user: otherUser.address,
                allowPublic: true
            })).toBe(false)
        })
    })

    it('get permissions', async () => {
        await stream.grantPermissions({ public: true, permissions: [StreamPermission.PUBLISH] })
        const permissions = await stream.getPermissions()
        const owner = await client.getAddress()
        return expect(permissions).toIncludeSameMembers([{
            user: owner.toLowerCase(),
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
    })

    it('no permissions initially for other users', async () => {
        expect(await stream.hasPermission({
            user: otherUser.address,
            permission: StreamPermission.SUBSCRIBE,
            allowPublic: false
        })).toBe(false)
        expect(await stream.hasPermission({
            public: true,
            permission: StreamPermission.SUBSCRIBE
        })).toBe(false)
    })

    it('can revoke non-existing permissions', async () => {
        await stream.revokePermissions({
            user: otherUser.address,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        await stream.revokePermissions({
            public: true,
            permissions: [StreamPermission.SUBSCRIBE]
        })
    })

    it('set permissions', async () => {
        const otherStream = await client.createStream({
            id: createRelativeTestStreamId(module)
        })
        const user1 = randomEthereumAddress()
        const user2 = randomEthereumAddress()
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
            { permission: StreamPermission.PUBLISH, allowPublic: true, user: randomEthereumAddress() }
        )).toBe(true)
    })

    it('grant same permission multiple times', async () => {
        await stream.grantPermissions({
            user: otherUser.address,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const previousPermissions = await stream.getPermissions()
        await stream.grantPermissions({
            user: otherUser.address,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const permissions = await stream.getPermissions()
        expect(permissions).toEqual(previousPermissions)
    })

    it('granting publish permission enables publishing (invalidates isStreamPublisher cache)', async () => {
        const otherUserClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: otherUser.privateKey,
            }
        }) 
        const message = {
            foo: Date.now()
        }
        const errorSnippet = `${otherUser.address.toLowerCase()} is not a publisher on stream ${stream.id}`
        await expect(() => otherUserClient.publish(stream.id, message)).rejects.toThrow(errorSnippet)
        await client.grantPermissions(stream.id, {
            user: otherUser.address,
            permissions: [StreamPermission.PUBLISH]
        })
        await expect(() => otherUserClient.publish(stream.id, message)).resolves
        await otherUserClient.destroy()
    })
})
