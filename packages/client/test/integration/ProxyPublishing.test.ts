import { createTestStream, fakePrivateKey, getCreateClient } from '../utils'
import { ConfigTest, Stream, StreamOperation, StreamrClient } from '../../src'
import { wait } from 'streamr-test-utils'
import { SPID } from 'streamr-client-protocol'

describe('PubSub with proxy connections', () => {
    let stream: Stream
    let publishingClient: StreamrClient
    let proxyClient: StreamrClient
    let pubPrivateKey: string
    let proxyPrivateKey: string
    let proxyNodeId: string
    const createClient = getCreateClient()

    beforeEach(async () => {
        pubPrivateKey = fakePrivateKey()
        proxyPrivateKey = fakePrivateKey()

        publishingClient = createClient({
            id: 'publisher',
            auth: {
                privateKey: pubPrivateKey
            }
        })
        proxyClient = createClient({
            id: 'proxy',
            auth: {
                privateKey: proxyPrivateKey
            },
            network: {
                acceptProxyConnections: true,
                trackers: ConfigTest.network.trackers
            }
        })
        proxyNodeId = await proxyClient.node.getNodeId()
        stream = await createTestStream(publishingClient, module)
        const pubUser = await publishingClient.getUserInfo()
        const proxyUser = await proxyClient.getUserInfo()

        await stream.grantPermission(StreamOperation.STREAM_GET, pubUser.username)
        await stream.grantPermission(StreamOperation.STREAM_PUBLISH, pubUser.username)

        await stream.grantPermission(StreamOperation.STREAM_GET, proxyUser.username)
        await stream.grantPermission(StreamOperation.STREAM_PUBLISH, proxyUser.username)
        await stream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, proxyUser.username)

    })

    it('Publish only connections work', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(1000)
        await publishingClient.setPublishProxy(stream, proxyNodeId)
        publishingClient.publish(stream, {
            msg: 'hellow'
        })
        publishingClient.publish(stream, {
            msg: 'hellow'
        })
        publishingClient.publish(stream, {
            msg: 'hellow'
        })
        await wait(2500)
        expect(receivedMessagesProxy.length).toEqual(3)
        // @ts-expect-error private
        expect((await publishingClient.publisher.node.getNode()).streams.hasOutOnlyConnection(new SPID(stream.streamId, 0), proxyNodeId)).toEqual(true)
    }, 15000)

    it('removing proxy publishing node works', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(1000)
        await publishingClient.setPublishProxy(stream, proxyNodeId)
        await wait(2000)
        // @ts-expect-error private
        expect((await publishingClient.publisher.node.getNode()).streams.hasOutOnlyConnection(new SPID(stream.streamId, 0), proxyNodeId)).toEqual(true)

        await publishingClient.removePublishProxy(stream, proxyNodeId)
        await wait(2500)

        // @ts-expect-error private
        expect((await publishingClient.publisher.node.getNode()).streams.isSetUp(new SPID(stream.streamId, 0))).toEqual(false)
    }, 15000)
})
