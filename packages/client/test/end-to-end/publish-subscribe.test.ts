import { Wallet } from 'ethers'
import { StreamID, toStreamPartID } from '@streamr/protocol'
import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { PermissionAssignment, StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { entryPointTranslator } from '../../src/utils/utils'
import { createTestStream, createTestClient } from '../test-utils/utils'
import { waitForCondition } from '@streamr/utils'
import { NetworkNode } from '@streamr/trackerless-network'

const TIMEOUT = 30 * 1000

const PAYLOAD = { hello: 'world' }

const ENCRYPTED_MESSSAGE_FORMAT = /^[0-9A-Fa-f]+$/

async function startNetworkNodeAndListenForAtLeastOneMessage(streamId: StreamID): Promise<unknown[]> {
    const entryPoints = entryPointTranslator(CONFIG_TEST.network!.layer0!.entryPoints!)
    const networkNode = new NetworkNode({
        ...CONFIG_TEST.network as any,
        layer0: {
            entryPoints,
        },
        networkNode: {} 
    })

    try {
        await networkNode.start()
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
        ...CONFIG_TEST,
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
        publisherClient = createTestClient(publisherPk, 'publisher', 15656)
        subscriberClient = createTestClient(subscriberWallet.privateKey, 'subscriber', 15657)
    }, TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([
            publisherClient?.destroy(),
            subscriberClient?.destroy(),
        ])
    }, TIMEOUT)

    describe('private stream', () => {
        let stream: Stream

        beforeEach(async () => {
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
            const messages: any[] = []
            await subscriberClient.subscribe(stream.id, (msg: any) => {
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
            await subscriberClient.subscribe(stream.id, (msg: any) => {
                messages.push(msg)
            })
            await publisherClient.publish(stream.id, PAYLOAD)
            await waitForCondition(() => messages.length > 0)
            expect(messages).toEqual([PAYLOAD])
        }, TIMEOUT)
    })
})
