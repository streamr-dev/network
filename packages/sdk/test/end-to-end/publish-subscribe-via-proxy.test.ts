import { Wallet } from 'ethers'
import { describeOnlyInNodeJs, fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { ProxyDirection } from '@streamr/trackerless-network'
import { collect, wait, withTimeout } from '@streamr/utils'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { createTestClient, createTestStream } from '../test-utils/utils'

const TIMEOUT = 30 * 1000
const SUBSCRIBE_WAIT_TIME = 2000
const WEBSOCKET_PORT = 14231

describeOnlyInNodeJs('publish/subscribe via proxy', () => {
    // Cannot run proxy server in browser

    let stream: Stream
    let client: StreamrClient
    let proxyUser: Wallet = fastWallet()

    beforeEach(async () => {
        client = createTestClient(await fetchPrivateKeyWithGas())
        stream = await createTestStream(client, module)
        proxyUser = fastWallet()
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE],
            userId: proxyUser.address
        })
    }, TIMEOUT)

    afterEach(async () => {
        await client.destroy()
    })

    it(
        'publish',
        async () => {
            const proxy = createTestClient(proxyUser.privateKey, WEBSOCKET_PORT, true)
            const subscription = await proxy.subscribe(stream)
            await wait(SUBSCRIBE_WAIT_TIME)
            await client.setProxies(stream, [await proxy.getPeerDescriptor()], ProxyDirection.PUBLISH)

            await client.publish(stream, {
                foo: 'bar'
            })
            const receivedMessages = await collect(subscription, 1)
            expect(receivedMessages[0].content).toEqual({ foo: 'bar' })
            await proxy.destroy()
        },
        TIMEOUT
    )

    it(
        'subscribe',
        async () => {
            const proxy = createTestClient(proxyUser.privateKey, WEBSOCKET_PORT, true)
            await proxy.subscribe(stream)
            await wait(SUBSCRIBE_WAIT_TIME)
            await client.setProxies(stream, [await proxy.getPeerDescriptor()], ProxyDirection.SUBSCRIBE)
            const subscription = await client.subscribe(stream)

            await proxy.publish(stream, {
                foo: 'bar'
            })
            const receivedMessages = await collect(subscription, 1)
            expect(receivedMessages[0].content).toEqual({ foo: 'bar' })
            await proxy.destroy()
        },
        TIMEOUT
    )

    it(
        "proxy doesn't accept connections",
        async () => {
            const proxy = createTestClient(proxyUser.privateKey, WEBSOCKET_PORT, false)
            const subscription = await proxy.subscribe(stream)
            await wait(SUBSCRIBE_WAIT_TIME)
            await client.setProxies(stream, [await proxy.getPeerDescriptor()], ProxyDirection.PUBLISH)

            await client.publish(stream, {
                foo: 'bar'
            })
            await expect(async () => {
                return withTimeout(collect(subscription, 1), 2000)
            }).rejects.toThrow('timed out')
            await proxy.destroy()
        },
        TIMEOUT
    )
})
