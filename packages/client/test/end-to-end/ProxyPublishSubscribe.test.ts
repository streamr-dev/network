import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { ProxyDirection } from '@streamr/trackerless-network'
import { wait } from '@streamr/utils'
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

    beforeEach(async () => {
        onewayClient = createTestClient(await fetchPrivateKeyWithGas())
        proxyClient1 = await createTestClient(fastPrivateKey(), 14231, true)
    }, 10000)

    beforeEach(async () => {
        stream = await createTestStream(onewayClient, module)
        const proxyUser1 = await proxyClient1.getAddress()
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE], 
            user: proxyUser1
        })
    }, 60000)

    afterEach(async () => {
        await Promise.all([
            proxyClient1?.destroy(),
            onewayClient?.destroy()
        ])
    })

    it('happy path: publish via proxy', async () => {
        const receivedMessagesProxy: any[] = []
        await proxyClient1.subscribe(stream, (msg) => {
            receivedMessagesProxy.push(msg)
        })
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setProxies(stream, [await proxyClient1.getPeerDescriptor()], ProxyDirection.PUBLISH)

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

        await onewayClient.setProxies(stream, [await proxyClient1.getPeerDescriptor()], ProxyDirection.SUBSCRIBE)
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
