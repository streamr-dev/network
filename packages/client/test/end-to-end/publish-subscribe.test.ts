import { fastPrivateKey, waitForCondition } from 'streamr-test-utils'
import { createTestStream, fetchPrivateKeyWithGas } from '../test-utils/utils'
import { ConfigTest, Stream, StreamPermission, StreamrClient } from '../../src'
import { createNetworkNode, NetworkNode } from 'streamr-network'
import { toStreamPartID } from 'streamr-client-protocol'

const TIMEOUT = 10 * 1000

const PAYLOAD = { hello: 'world' }

const ENCRYPTED_MESSSAGE_FORMAT = /^[0-9A-Fa-f]+$/

describe('publish-subscribe', () => {
    let publisherClient: StreamrClient
    let subscriberClient: StreamrClient
    let networkNode: NetworkNode

    beforeEach(async () => {
        publisherClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: await fetchPrivateKeyWithGas()
            }
        })
        subscriberClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: fastPrivateKey()
            }
        })
        networkNode = await createNetworkNode({
            ...ConfigTest.network,
            id: 'networkNode',
        })
    }, TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([
            publisherClient?.destroy(),
            subscriberClient?.destroy(),
            networkNode?.stop()
        ])
    }, TIMEOUT)

    describe('non-public stream', () => {
        let stream: Stream

        beforeEach(async () => {
            stream = await createTestStream(publisherClient, module)
            await stream.grantPermissions({
                permissions: [StreamPermission.SUBSCRIBE],
                user: await subscriberClient.getAddress()
            })
        }, TIMEOUT)

        it('messages are published encrypted', async () => {
            const messages: unknown[] = []
            await networkNode.subscribeAndWaitForJoin(toStreamPartID(stream.id, 0), 4999)
            networkNode.addMessageListener((msg) => {
                messages.push(msg.getContent())
            })
            await publisherClient.publish(stream.id, PAYLOAD)
            await waitForCondition(() => messages.length > 0)
            expect(messages).toHaveLength(1)
            expect(messages[0]).toMatch(ENCRYPTED_MESSSAGE_FORMAT)
        }, TIMEOUT)

        it('subscriber is able to receive and decrypt messages', async () => {
            const messages: unknown[] = []
            await subscriberClient.subscribe(stream.id, (msg) => {
                messages.push(msg)
            })
            await publisherClient.publish(stream.id, PAYLOAD)
            await waitForCondition(() => messages.length > 0)
            expect(messages).toEqual([PAYLOAD])
        }, TIMEOUT)
    })

    describe('public stream', () => {
        let stream: Stream

        beforeEach(async () => {
            stream = await createTestStream(publisherClient, module)
            await stream.grantPermissions({
                permissions: [StreamPermission.SUBSCRIBE],
                public: true
            })
        }, TIMEOUT)

        it('messages are published unencrypted', async () => {
            const messages: unknown[] = []
            await networkNode.subscribeAndWaitForJoin(toStreamPartID(stream.id, 0), 4999)
            networkNode.addMessageListener((msg) => {
                messages.push(msg.getContent())
            })
            await publisherClient.publish(stream.id, PAYLOAD)
            await waitForCondition(() => messages.length > 0)
            expect(messages).toEqual([PAYLOAD])
        }, TIMEOUT)

        it('subscriber is able to receive messages', async () => {
            const messages: unknown[] = []
            await subscriberClient.subscribe(stream.id, (msg) => {
                messages.push(msg)
            })
            await publisherClient.publish(stream.id, PAYLOAD)
            await waitForCondition(() => messages.length > 0)
            expect(messages).toEqual([PAYLOAD])
        }, TIMEOUT)
    })
})
