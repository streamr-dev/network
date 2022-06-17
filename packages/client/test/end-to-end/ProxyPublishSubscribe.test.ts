import { createTestStream, getCreateClient } from '../test-utils/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { ConfigTest } from '../../src/ConfigTest'
import { fastPrivateKey, fetchPrivateKeyWithGas, wait } from 'streamr-test-utils'
import { ProxyDirection, toStreamPartID } from 'streamr-client-protocol'
import { until } from '../../src/utils/promises'

jest.setTimeout(50000)
const SUBSCRIBE_WAIT_TIME = 2000

describe('PubSub with proxy connections', () => {
    let stream: Stream
    let onewayClient: StreamrClient
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

        onewayClient = await createClient({
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
                trackers: ConfigTest.network!.trackers
            }
        })
        proxyClient2 = await createClient({
            id: 'proxy',
            auth: {
                privateKey: proxyPrivateKey2
            },
            network: {
                acceptProxyConnections: true,
                trackers: ConfigTest.network!.trackers
            }
        })
    }, 10000)

    beforeEach(async () => {
        // @ts-expect-error private
        proxyNodeId1 = await proxyClient1.node.getNodeId()
        // @ts-expect-error private
        proxyNodeId2 = await proxyClient2.node.getNodeId()
        stream = await createTestStream(onewayClient, module)
        const proxyUser1 = await proxyClient1.getAddress()
        const proxyUser2 = await proxyClient2.getAddress()
        await onewayClient.setPermissions({
            streamId: stream.id,
            assignments: [
                { permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE], user: proxyUser1 },
                { permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE], user: proxyUser2 }
            ]
        })
    }, 60000)

    it('Proxy publish connections work', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.openProxyConnections(stream, [proxyNodeId1], ProxyDirection.PUBLISH)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyNodeId1, ProxyDirection.PUBLISH))
            .toEqual(true)

        await onewayClient.publish(stream, {
            msg: 'hellow'
        })
        await onewayClient.publish(stream, {
            msg: 'hellow'
        })
        await onewayClient.publish(stream, {
            msg: 'hellow'
        })
        await until(() => receivedMessagesProxy.length >= 3)
        expect(receivedMessagesProxy.length).toEqual(3)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyNodeId1, ProxyDirection.PUBLISH))
            .toEqual(true)
    }, 15000)

    it('Open publish proxies, close publish proxies', async () => {
        const receivedMessagesProxy1: any[] = []
        const receivedMessagesProxy2: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy1.push(msg)
        })
        await proxyClient2.subscribe(stream, (msg) => {
            receivedMessagesProxy2.push(msg)
        })
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.openProxyConnections(stream, [proxyNodeId1, proxyNodeId2], ProxyDirection.PUBLISH)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyNodeId1, ProxyDirection.PUBLISH))
            .toEqual(true)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyNodeId2, ProxyDirection.PUBLISH))
            .toEqual(true)

        await onewayClient.closeProxyConnections(stream, [proxyNodeId1, proxyNodeId2], ProxyDirection.PUBLISH)

        expect((await onewayClient.getNode())
            .hasStreamPart(toStreamPartID(stream.id, 0)))
            .toEqual(false)

        expect((await onewayClient.getNode())
            .hasStreamPart(toStreamPartID(stream.id, 0)))
            .toEqual(false)

    }, 15000)

    it('Proxy subscribe connections work', async () => {
        const receivedMessages: any[] = []
        await proxyClient1.subscribe(stream)
        await wait(SUBSCRIBE_WAIT_TIME)

        await onewayClient.openProxyConnections(stream, [proxyNodeId1], ProxyDirection.SUBSCRIBE)
        await onewayClient.subscribe(stream, (msg) => {
            receivedMessages.push(msg)
        })
        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyNodeId1, ProxyDirection.SUBSCRIBE))
            .toEqual(true)

        await proxyClient1.publish(stream, {
            msg: 'hellow'
        })
        await proxyClient1.publish(stream, {
            msg: 'hellow'
        })
        await proxyClient1.publish(stream, {
            msg: 'hellow'
        })
        await until(() => receivedMessages.length >= 3)
        expect(receivedMessages.length).toEqual(3)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyNodeId1, ProxyDirection.SUBSCRIBE))
            .toEqual(true)
    }, 15000)

    it('open subscribe proxies, close subscribe proxies', async () => {
        await proxyClient1.subscribe(stream)
        await proxyClient2.subscribe(stream)
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.openProxyConnections(stream, [proxyNodeId1, proxyNodeId2], ProxyDirection.SUBSCRIBE)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyNodeId1, ProxyDirection.SUBSCRIBE))
            .toEqual(true)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyNodeId2, ProxyDirection.SUBSCRIBE))
            .toEqual(true)

        await onewayClient.unsubscribe(stream)
        await onewayClient.closeProxyConnections(stream, [proxyNodeId1, proxyNodeId2], ProxyDirection.SUBSCRIBE)

        expect((await onewayClient.getNode())
            .hasStreamPart(toStreamPartID(stream.id, 0)))
            .toEqual(false)

        expect((await onewayClient.getNode())
            .hasStreamPart(toStreamPartID(stream.id, 0)))
            .toEqual(false)
    }, 15000)
})
