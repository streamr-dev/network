import { toStreamPartID } from '@streamr/protocol'
import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { NodeID, ProxyDirection } from '@streamr/trackerless-network'
import { wait } from '@streamr/utils'
import { NetworkPeerDescriptor } from '../../src/Config'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { until } from '../../src/utils/promises'
import { createTestClient, createTestStream } from '../test-utils/utils'

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
    let proxyPeerKey1: NodeID
    let proxyPeerKey2: NodeID

    const proxyNodePort1 = 14231
    const proxyNodePort2 = 14232

    let proxyNodeDescriptor1: NetworkPeerDescriptor
    let proxyNodeDescriptor2: NetworkPeerDescriptor

    beforeEach(async () => {
        pubPrivateKey = await fetchPrivateKeyWithGas()
        proxyPrivateKey1 = fastPrivateKey()
        proxyPrivateKey2 = fastPrivateKey()

        onewayClient = createTestClient(pubPrivateKey)

        proxyClient1 = await createTestClient(proxyPrivateKey1, proxyNodePort1, true)
        proxyClient2 = await createTestClient(proxyPrivateKey2, proxyNodePort2, true)
        proxyNodeDescriptor1 = await proxyClient1.getPeerDescriptor()
        proxyNodeDescriptor2 = await proxyClient2.getPeerDescriptor()

    }, 10000)

    beforeEach(async () => {
        stream = await createTestStream(onewayClient, module)

        const proxyUser1 = await proxyClient1.getAddress()
        const proxyUser2 = await proxyClient2.getAddress()

        proxyPeerKey1 = await proxyClient1.getNodeId()
        proxyPeerKey2 = await proxyClient2.getNodeId()

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

    it('happy path: publish via proxy', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setProxies(stream, [proxyNodeDescriptor1], ProxyDirection.PUBLISH)

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
    }, 15000)

    it('happy path: subscribe via proxy', async () => {
        const receivedMessages: any[] = []
        await proxyClient1.subscribe(stream)
        await wait(SUBSCRIBE_WAIT_TIME)

        await onewayClient.setProxies(stream, [proxyNodeDescriptor1], ProxyDirection.SUBSCRIBE)
        await onewayClient.subscribe(stream, (msg) => {
            receivedMessages.push(msg)
        })

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
    }, 15000)
})
