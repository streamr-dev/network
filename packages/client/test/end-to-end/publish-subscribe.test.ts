import { fastWallet, fetchPrivateKeyWithGas, waitForCondition } from 'streamr-test-utils'
import { createTestStream } from '../test-utils/utils'
import { ConfigTest, PermissionAssignment, Stream, StreamPermission, StreamrClient } from '../../src'
import { createNetworkNode } from 'streamr-network'
import { StreamID, toStreamPartID } from 'streamr-client-protocol'
import { Wallet } from 'ethers'

const TIMEOUT = 20 * 1000

const PAYLOAD = { hello: 'world' }

const ENCRYPTED_MESSSAGE_FORMAT = /^[0-9A-Fa-f]+$/

async function startNetworkNodeAndListenForAtLeastOneMessage(streamId: StreamID): Promise<unknown[]> {
    const networkNode = await createNetworkNode({
        // TODO better typing for ConfigTest.network.trackers?
        ...ConfigTest.network as any,
        id: 'networkNode',
    })
    try {
        networkNode.subscribe(toStreamPartID(streamId, 0))
        const messages: unknown[] = []
        networkNode.addMessageListener((msg) => {
            messages.push(msg.getContent())
        })
        await waitForCondition(() => messages.length > 0, TIMEOUT - 100)
        return messages
    } finally {
        await networkNode.stop()
    }
}

async function createStreamWithPermissions(
    privateKey: string,
    ...assignments: PermissionAssignment[]
): Promise<Stream> {
    const creatorClient = new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey
        }
    })
    try {
        const stream = await createTestStream(creatorClient, module)
        await stream.grantPermissions(...assignments)
        return stream
    } finally {
        await creatorClient.destroy()
    }
}

describe('publish-subscribe', () => {
    let subscriberWallet: Wallet
    let publisherPk: string
    let publisherClient: StreamrClient
    let subscriberClient: StreamrClient

    beforeAll(async () => {
        subscriberWallet = fastWallet()
        publisherPk = await fetchPrivateKeyWithGas()
    })

    beforeEach(async () => {
        publisherClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: publisherPk
            }
        })
        subscriberClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: subscriberWallet.privateKey
            }
        })

    }, TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([
            publisherClient?.destroy(),
            subscriberClient?.destroy(),
        ])
    }, TIMEOUT)

    describe('non-public stream', () => {
        let stream: Stream

        beforeAll(async () => {
            stream = await createStreamWithPermissions(publisherPk, {
                permissions: [StreamPermission.SUBSCRIBE],
                user: subscriberWallet.address
            })
        }, TIMEOUT)

        it('messages are published encrypted', async () => {
            await publisherClient.publish(stream.id, PAYLOAD)
            const messages = await startNetworkNodeAndListenForAtLeastOneMessage(stream.id)
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

        beforeAll(async () => {
            stream = await createStreamWithPermissions(publisherPk, {
                permissions: [StreamPermission.SUBSCRIBE],
                public: true
            })
        }, TIMEOUT)

        it('messages are published unencrypted', async () => {
            await publisherClient.publish(stream.id, PAYLOAD)
            const messages = await startNetworkNodeAndListenForAtLeastOneMessage(stream.id)
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
