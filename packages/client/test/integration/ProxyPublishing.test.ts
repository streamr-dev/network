import { createTestStream, getCreateClient, fetchPrivateKeyWithGas } from '../test-utils/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import ConfigTest from '../../src/ConfigTest'
import { fastPrivateKey, wait } from 'streamr-test-utils'
import { toStreamPartID } from 'streamr-client-protocol'

jest.setTimeout(50000)

describe('PubSub with proxy connections', () => {
    let stream: Stream
    let publishingClient: StreamrClient
    let proxyClient1: StreamrClient
    let proxyClient2: StreamrClient
    let pubPrivateKey: string
    let proxyPrivateKey1: string
    let proxyPrivateKey2: string
    let proxyNodeId1: string
    let proxyNodeId2: string
    const createClient = getCreateClient()

    beforeEach(async () => {
        pubPrivateKey = await fetchPrivateKeyWithGas()
        proxyPrivateKey1 = fastPrivateKey()
        proxyPrivateKey2 = fastPrivateKey()

        publishingClient = await createClient({
            id: 'publisher',
            auth: {
                privateKey: pubPrivateKey
            }
        })
        proxyClient1 = await createClient({
            id: 'proxy',
            auth: {
                privateKey: proxyPrivateKey1
            },
            network: {
                acceptProxyConnections: true,
                trackers: ConfigTest.network.trackers
            }
        })
        proxyClient2 = await createClient({
            id: 'proxy',
            auth: {
                privateKey: proxyPrivateKey2
            },
            network: {
                acceptProxyConnections: true,
                trackers: ConfigTest.network.trackers
            }
        })
    }, 10000)

    beforeEach(async () => {
        proxyNodeId1 = await proxyClient1.node.getNodeId()
        proxyNodeId2 = await proxyClient2.node.getNodeId()
        stream = await createTestStream(publishingClient, module)
        const pubUser = await publishingClient.getUserInfo()
        const proxyUser = await proxyClient1.getUserInfo()
        const proxyUser2 = await proxyClient2.getUserInfo()

        await stream.grantPermissions({ permissions: [StreamPermission.PUBLISH], user: pubUser.username })
        await stream.grantPermissions({ permissions: [StreamPermission.PUBLISH], user: proxyUser.username })
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], user: proxyUser.username })
        await stream.grantPermissions({ permissions: [StreamPermission.PUBLISH], user: proxyUser2.username })
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], user: proxyUser2.username })
    }, 60000)

    it('Publish only connections work', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(2000)
        await publishingClient.setPublishProxy(stream, proxyNodeId1)

        expect((await publishingClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasOutOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
            .toEqual(true)

        await publishingClient.publish(stream, {
            msg: 'hellow'
        })
        await publishingClient.publish(stream, {
            msg: 'hellow'
        })
        await publishingClient.publish(stream, {
            msg: 'hellow'
        })
        await wait(2500)
        expect(receivedMessagesProxy.length).toEqual(3)

        expect((await publishingClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasOutOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
            .toEqual(true)
    }, 15000)

    it('removing proxy publishing node works', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(1000)
        await publishingClient.setPublishProxy(stream, proxyNodeId1)

        expect((await publishingClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasOutOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
            .toEqual(true)

        await publishingClient.removePublishProxy(stream, proxyNodeId1)

        expect((await publishingClient.getNode())
            // @ts-expect-error private
            .streamPartManager.isSetUp(toStreamPartID(stream.id, 0)))
            .toEqual(false)
    }, 15000)

    it('setPublishProxies, removePublishProxies', async () => {
        const receivedMessagesProxy1: any[] = []
        const receivedMessagesProxy2: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy1.push(msg)
        })
        await proxyClient2.subscribe(stream, (msg) => {
            receivedMessagesProxy2.push(msg)
        })
        await wait(1000)
        await publishingClient.setPublishProxies(stream, [proxyNodeId1, proxyNodeId2])

        expect((await publishingClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasOutOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
            .toEqual(true)

        expect((await publishingClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasOutOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId2))
            .toEqual(true)

        await publishingClient.removePublishProxies(stream, [proxyNodeId1, proxyNodeId2])

        expect((await publishingClient.getNode())
            // @ts-expect-error private
            .streamPartManager.isSetUp(toStreamPartID(stream.id, 0)))
            .toEqual(false)

        expect((await publishingClient.getNode())
            // @ts-expect-error private
            .streamPartManager.isSetUp(toStreamPartID(stream.id, 0)))
            .toEqual(false)

    }, 15000)
})
