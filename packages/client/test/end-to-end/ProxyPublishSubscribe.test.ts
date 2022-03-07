import { createTestStream, getCreateClient, fetchPrivateKeyWithGas } from '../test-utils/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'
import { StreamPermission } from '../../src/permission'
import { ConfigTest } from '../../src/ConfigTest'
import { fastPrivateKey, wait } from 'streamr-test-utils'
import { toStreamPartID } from 'streamr-client-protocol'
import { until } from '../../src/utils'

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
        // @ts-expect-error
        proxyNodeId1 = await proxyClient1.node.getNodeId()
        // @ts-expect-error
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

    it('Publish only connections work', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setPublishProxy(stream, proxyNodeId1)

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasOutOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
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
            // @ts-expect-error private
            .streamPartManager.hasOutOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
            .toEqual(true)
    }, 15000)

    it('removing proxy publishing node works', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setPublishProxy(stream, proxyNodeId1)

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasOutOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
            .toEqual(true)

        await onewayClient.removePublishProxy(stream, proxyNodeId1)

        expect((await onewayClient.getNode())
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
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setPublishProxies(stream, [proxyNodeId1, proxyNodeId2])

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasOutOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
            .toEqual(true)

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasOutOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId2))
            .toEqual(true)

        await onewayClient.removePublishProxies(stream, [proxyNodeId1, proxyNodeId2])

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.isSetUp(toStreamPartID(stream.id, 0)))
            .toEqual(false)

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.isSetUp(toStreamPartID(stream.id, 0)))
            .toEqual(false)

    }, 15000)

    it('Subscribe only connections work', async () => {
        const receivedMessages: any[] = []
        await proxyClient1.subscribe(stream)
        await wait(SUBSCRIBE_WAIT_TIME)

        await onewayClient.setSubscribeProxy(stream, proxyNodeId1)
        await onewayClient.subscribe(stream, (msg) => {
            receivedMessages.push(msg)
        })
        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasInOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
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
            // @ts-expect-error private
            .streamPartManager.hasInOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
            .toEqual(true)
    }, 15000)

    it('removing proxy subscribing node works', async () => {
        await proxyClient2.subscribe(stream)
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setSubscribeProxy(stream, proxyNodeId2)

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasInOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId2))
            .toEqual(true)

        // await onewayClient.unsubscribe(stream)
        await onewayClient.removeSubscribeProxy(stream, proxyNodeId2)

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.isSetUp(toStreamPartID(stream.id, 0)))
            .toEqual(false)
    }, 15000)

    it('setSubscribeProxies, removeSubscribeProxies', async () => {
        await proxyClient1.subscribe(stream)
        await proxyClient2.subscribe(stream)
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setSubscribeProxies(stream, [proxyNodeId1, proxyNodeId2])

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasInOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId1))
            .toEqual(true)

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.hasInOnlyConnection(toStreamPartID(stream.id, 0), proxyNodeId2))
            .toEqual(true)

        await onewayClient.unsubscribe(stream)
        await onewayClient.removeSubscribeProxies(stream, [proxyNodeId1, proxyNodeId2])

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.isSetUp(toStreamPartID(stream.id, 0)))
            .toEqual(false)

        expect((await onewayClient.getNode())
            // @ts-expect-error private
            .streamPartManager.isSetUp(toStreamPartID(stream.id, 0)))
            .toEqual(false)
    }, 15000)
})
