import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { ProxyDirection } from '@streamr/trackerless-network'
import { wait, collect } from '@streamr/utils'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { createTestClient, createTestStream } from '../test-utils/utils'

jest.setTimeout(50000)
const SUBSCRIBE_WAIT_TIME = 2000

describe('publish/subscribe via proxy', () => {

    let stream: Stream
    let onewayClient: StreamrClient
    let proxyClient: StreamrClient

    beforeEach(async () => {
        onewayClient = createTestClient(await fetchPrivateKeyWithGas())
        proxyClient = createTestClient(fastPrivateKey(), 14231, true)
    }, 10000)

    beforeEach(async () => {
        stream = await createTestStream(onewayClient, module)
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE], 
            user: await proxyClient.getAddress()
        })
    }, 60000)

    afterEach(async () => {
        await Promise.all([
            proxyClient.destroy(),
            onewayClient.destroy()
        ])
    })

    it('happy path: publish via proxy', async () => {
        const subscription = await proxyClient.subscribe(stream)
        await wait(SUBSCRIBE_WAIT_TIME)
        await onewayClient.setProxies(stream, [await proxyClient.getPeerDescriptor()], ProxyDirection.PUBLISH)

        await onewayClient.publish(stream, {
            foo: 'bar'
        })
        const receivedMessages = await collect(subscription, 1)
        expect(receivedMessages[0].content).toEqual({ foo: 'bar' })
    }, 15000)

    it('happy path: subscribe via proxy', async () => {
        await proxyClient.subscribe(stream)
        await wait(SUBSCRIBE_WAIT_TIME)

        await onewayClient.setProxies(stream, [await proxyClient.getPeerDescriptor()], ProxyDirection.SUBSCRIBE)
        const subscription = await onewayClient.subscribe(stream)

        await proxyClient.publish(stream, {
            foo: 'bar'
        })
        const receivedMessages = await collect(subscription, 1)
        expect(receivedMessages[0].content).toEqual({ foo: 'bar' })
    }, 15000)
})
