import { Wallet } from 'ethers'

import { createRelativeTestStreamId, fetchPrivateKeyWithGas } from '../test-utils/utils'
import { ConfigTest } from '../../src/ConfigTest'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { randomEthereumAddress } from 'streamr-test-utils'
import { EthereumAddress } from 'streamr-client-protocol'
import { StreamEndpointsCached } from '../../src/StreamEndpointsCached'

jest.setTimeout(40000)

describe('Stream permissions', () => {

    let client: StreamrClient
    let stream: Stream
    let otherUser: EthereumAddress

    beforeAll(async () => {
        const wallet = new Wallet(await fetchPrivateKeyWithGas())
        otherUser = randomEthereumAddress()
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
                user: otherUser,
                permissions: [StreamPermission.PUBLISH, StreamPermission.EDIT],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: otherUser,
                allowPublic: false
            })).toBe(true)
            expect(await stream.hasPermission({
                permission: StreamPermission.EDIT,
                user: otherUser,
                allowPublic: false
            })).toBe(true)
            await stream.revokePermissions({
                user: otherUser,
                permissions: [StreamPermission.PUBLISH, StreamPermission.EDIT],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: otherUser,
                allowPublic: false
            })).toBe(false)
            expect(await stream.hasPermission({
                permission: StreamPermission.EDIT,
                user: otherUser,
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
                user: otherUser,
                allowPublic: true
            })).toBe(true)
            expect(await stream.hasPermission({
                permission: StreamPermission.SUBSCRIBE,
                user: otherUser,
                allowPublic: true
            })).toBe(true)
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: otherUser,
                allowPublic: false
            })).toBe(false)
            expect(await stream.hasPermission({
                permission: StreamPermission.SUBSCRIBE,
                user: otherUser,
                allowPublic: false
            })).toBe(false)
            await stream.revokePermissions({
                public: true,
                permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE],
            })
            expect(await stream.hasPermission({
                permission: StreamPermission.PUBLISH,
                user: otherUser,
                allowPublic: true
            })).toBe(false)
            expect(await stream.hasPermission({
                permission: StreamPermission.SUBSCRIBE,
                user: otherUser,
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
            user: otherUser,
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
            user: otherUser,
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
            user: otherUser,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const previousPermissions = await stream.getPermissions()
        await stream.grantPermissions({
            user: otherUser,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        const permissions = await stream.getPermissions()
        expect(permissions).toEqual(previousPermissions)
    })

    it('modification invalidates StreamEndpointsCached', async () => {
        // @ts-expect-error
        const cachedStreamEndpoint = client.container.resolve(StreamEndpointsCached)
        expect(await cachedStreamEndpoint.isStreamPublisher(stream.id, otherUser)).toBe(false)
        await client.grantPermissions(stream.id, {
            user: otherUser,
            permissions: [StreamPermission.PUBLISH]
        })
        expect(await cachedStreamEndpoint.isStreamPublisher(stream.id, otherUser)).toBe(true)
    })
})
