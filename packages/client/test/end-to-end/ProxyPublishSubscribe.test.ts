import { createTestStream, createTestClient } from '../test-utils/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { wait } from '@streamr/utils'
import { toStreamPartID } from '@streamr/protocol'
import { ProxyDirection } from '@streamr/trackerless-network'
import { until } from '../../src/utils/promises'
import { JsonPeerDescriptor } from '../../src/Config'

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
    let proxyPeerKey1: string
    let proxyPeerKey2: string

    const proxyNodeId1 = 'proxy1'
    const proxyNodeId2 = 'proxy2'
    const proxyNodePort1 = 14231
    const proxyNodePort2 = 14232

    const proxyNodeDescriptor1: JsonPeerDescriptor = {
        kademliaId: proxyNodeId1,
        type: 0,
        websocket: {
            ip: 'localhost',
            port: proxyNodePort1
        }
    }
    const proxyNodeDescriptor2: JsonPeerDescriptor = {
        kademliaId: proxyNodeId2,
        type: 0,
        websocket: {
            ip: 'localhost',
            port: proxyNodePort2
        }
    }

    beforeEach(async () => {
        pubPrivateKey = await fetchPrivateKeyWithGas()
        proxyPrivateKey1 = fastPrivateKey()
        proxyPrivateKey2 = fastPrivateKey()

        onewayClient = createTestClient(pubPrivateKey, 'proxiedNode')

        proxyClient1 = await createTestClient(proxyPrivateKey1, proxyNodeId1, proxyNodePort1, true)
        proxyClient2 = await createTestClient(proxyPrivateKey2, proxyNodeId2, proxyNodePort2, true)

    }, 10000)

    beforeEach(async () => {
        stream = await createTestStream(onewayClient, module)

        const proxyUser1 = await proxyClient1.getAddress()
        const proxyUser2 = await proxyClient2.getAddress()

        proxyPeerKey1 = (await proxyClient1.getNode()).getNodeId()
        proxyPeerKey2 = (await proxyClient2.getNode()).getNodeId()

        await onewayClient.setPermissions({
            streamId: stream.id,
            assignments: [
                { permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE], user: proxyUser1 },
                { permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE], user: proxyUser2 }
            ]
        })
    }, 60000)

    afterEach(async () => {
        await Promise.all([
            proxyClient1?.destroy(),
            proxyClient2?.destroy(),
            onewayClient?.destroy()
        ])
    })

    it('Proxy publish connections work', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setProxies(stream, [proxyNodeDescriptor1], ProxyDirection.PUBLISH)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyPeerKey1, ProxyDirection.PUBLISH))
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
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyPeerKey1, ProxyDirection.PUBLISH))
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
        await onewayClient.setProxies(stream, [proxyNodeDescriptor1, proxyNodeDescriptor2], ProxyDirection.PUBLISH)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyPeerKey1, ProxyDirection.PUBLISH))
            .toEqual(true)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyPeerKey2, ProxyDirection.PUBLISH))
            .toEqual(true)

        await onewayClient.setProxies(stream, [], ProxyDirection.PUBLISH)

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

        await onewayClient.setProxies(stream, [proxyNodeDescriptor1], ProxyDirection.SUBSCRIBE)
        await onewayClient.subscribe(stream, (msg) => {
            receivedMessages.push(msg)
        })
        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyPeerKey1, ProxyDirection.SUBSCRIBE))
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
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyPeerKey1, ProxyDirection.SUBSCRIBE))
            .toEqual(true)
    }, 15000)

    it('open subscribe proxies, close subscribe proxies', async () => {
        await proxyClient1.subscribe(stream)
        await proxyClient2.subscribe(stream)
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setProxies(stream, [proxyNodeDescriptor1, proxyNodeDescriptor2], ProxyDirection.SUBSCRIBE)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyPeerKey1, ProxyDirection.SUBSCRIBE))
            .toEqual(true)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyPeerKey2, ProxyDirection.SUBSCRIBE))
            .toEqual(true)

        await onewayClient.unsubscribe(stream)
        await onewayClient.setProxies(stream, [], ProxyDirection.SUBSCRIBE)

        expect((await onewayClient.getNode())
            .hasStreamPart(toStreamPartID(stream.id, 0)))
            .toEqual(false)

        expect((await onewayClient.getNode())
            .hasStreamPart(toStreamPartID(stream.id, 0)))
            .toEqual(false)
    }, 15000)

    it('Open proxies, close all proxies', async () => {
        const receivedMessagesProxy1: any[] = []
        const receivedMessagesProxy2: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy1.push(msg)
        })
        await proxyClient2.subscribe(stream, (msg) => {
            receivedMessagesProxy2.push(msg)
        })
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setProxies(stream, [proxyNodeDescriptor1, proxyNodeDescriptor2], ProxyDirection.PUBLISH)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyPeerKey1, ProxyDirection.PUBLISH))
            .toEqual(true)

        expect((await onewayClient.getNode())
            .hasProxyConnection(toStreamPartID(stream.id, 0), proxyPeerKey2, ProxyDirection.PUBLISH))
            .toEqual(true)

        await onewayClient.setProxies(stream, [], ProxyDirection.PUBLISH)

        expect((await onewayClient.getNode())
            .hasStreamPart(toStreamPartID(stream.id, 0)))
            .toEqual(false)

        expect((await onewayClient.getNode())
            .hasStreamPart(toStreamPartID(stream.id, 0)))
            .toEqual(false)

    }, 15000)

})
