import { createTestStream, fakePrivateKey, getCreateClient } from '../utils'
import { ConfigTest, Stream, StreamOperation, StreamrClient } from '../../src'
import { wait } from 'streamr-test-utils'
import { SPID } from 'streamr-client-protocol'

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
        pubPrivateKey = fakePrivateKey()
        proxyPrivateKey1 = fakePrivateKey()
        proxyPrivateKey2 = fakePrivateKey()

        publishingClient = createClient({
            id: 'publisher',
            auth: {
                privateKey: pubPrivateKey
            }
        })
        proxyClient1 = createClient({
            id: 'proxy',
            auth: {
                privateKey: proxyPrivateKey1
            },
            network: {
                acceptProxyConnections: true,
                trackers: ConfigTest.network.trackers
            }
        })
        proxyClient2 = createClient({
            id: 'proxy',
            auth: {
                privateKey: proxyPrivateKey2
            },
            network: {
                acceptProxyConnections: true,
                trackers: ConfigTest.network.trackers
            }
        })
        proxyNodeId1 = await proxyClient1.node.getNodeId()
        proxyNodeId2 = await proxyClient2.node.getNodeId()
        stream = await createTestStream(publishingClient, module)
        const pubUser = await publishingClient.getUserInfo()
        const proxyUser = await proxyClient1.getUserInfo()
        const proxyUser2 = await proxyClient2.getUserInfo()

        await stream.grantPermission(StreamOperation.STREAM_GET, pubUser.username)
        await stream.grantPermission(StreamOperation.STREAM_PUBLISH, pubUser.username)

        await stream.grantPermission(StreamOperation.STREAM_GET, proxyUser.username)
        await stream.grantPermission(StreamOperation.STREAM_PUBLISH, proxyUser.username)
        await stream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, proxyUser.username)

        await stream.grantPermission(StreamOperation.STREAM_GET, proxyUser2.username)
        await stream.grantPermission(StreamOperation.STREAM_PUBLISH, proxyUser2.username)
        await stream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, proxyUser2.username)
    })

    it('Publish only connections work', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(1000)
        await publishingClient.setPublishProxy(stream, proxyNodeId1)
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

        // @ts-expect-error private
        expect((await publishingClient.publisher.node.getNode())
            // @ts-expect-error private
            .streams.hasOutOnlyConnection(new SPID(stream.streamId, 0), proxyNodeId1))
            .toEqual(true)
    }, 15000)

    it('removing proxy publishing node works', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(1000)
        await publishingClient.setPublishProxy(stream, proxyNodeId1)
        await wait(2000)

        // @ts-expect-error private
        expect((await publishingClient.publisher.node.getNode())
            // @ts-expect-error private
            .streams.hasOutOnlyConnection(new SPID(stream.streamId, 0), proxyNodeId1))
            .toEqual(true)

        await publishingClient.removePublishProxy(stream, proxyNodeId1)
        await wait(2500)

        // @ts-expect-error private
        expect((await publishingClient.publisher.node.getNode())
            // @ts-expect-error private
            .streams.isSetUp(new SPID(stream.streamId, 0)))
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
        await wait(2000)

        // @ts-expect-error private
        expect((await publishingClient.publisher.node.getNode())
            // @ts-expect-error private
            .streams.hasOutOnlyConnection(new SPID(stream.streamId, 0), proxyNodeId1))
            .toEqual(true)

        // @ts-expect-error private
        expect((await publishingClient.publisher.node.getNode())
            // @ts-expect-error private
            .streams.hasOutOnlyConnection(new SPID(stream.streamId, 0), proxyNodeId2))
            .toEqual(true)

        await publishingClient.removePublishProxies(stream, [proxyNodeId1, proxyNodeId2])
        await wait(2000)

        // @ts-expect-error private
        expect((await publishingClient.publisher.node.getNode())
            // @ts-expect-error private
            .streams.isSetUp(new SPID(stream.streamId, 0)))
            .toEqual(false)

        // @ts-expect-error private
        expect((await publishingClient.publisher.node.getNode())
            // @ts-expect-error private
            .streams.isSetUp(new SPID(stream.streamId, 0)))
            .toEqual(false)

    }, 15000)
})
