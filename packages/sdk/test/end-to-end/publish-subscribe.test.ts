import { config as CHAIN_CONFIG } from '@streamr/config'
import { DhtAddress, NodeType, toDhtAddressRaw } from '@streamr/dht'
import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { createNetworkNode } from '@streamr/trackerless-network'
import { StreamID, toStreamPartID, until } from '@streamr/utils'
import { Wallet } from 'ethers'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { PermissionAssignment, StreamPermission } from '../../src/permission'
import { StreamMessageTranslator } from '../../src/protocol/StreamMessageTranslator'
import { createTestClient, createTestStream } from '../test-utils/utils'

const TIMEOUT = 30 * 1000

const PAYLOAD = { hello: 'world' }

async function startNetworkNodeAndListenForAtLeastOneMessage(streamId: StreamID): Promise<unknown[]> {
    const entryPoints = CHAIN_CONFIG.dev2.entryPoints.map((entryPoint) => ({
        ...entryPoint,
        nodeId: toDhtAddressRaw(entryPoint.nodeId as DhtAddress),
        type: NodeType.NODEJS
    }))
    const networkNode = createNetworkNode({
        layer0: {
            entryPoints
        }
    })
    try {
        await networkNode.start()
        networkNode.join(toStreamPartID(streamId, 0))
        const messages: unknown[] = []
        networkNode.addMessageListener((msg) => {
            messages.push(StreamMessageTranslator.toClientProtocol(msg).getParsedContent())
        })
        await until(() => messages.length > 0, TIMEOUT)
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
        environment: 'dev2',
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
        publisherClient = createTestClient(publisherPk, 15656)
        subscriberClient = createTestClient(subscriberWallet.privateKey, 15657)
    }, TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([publisherClient.destroy(), subscriberClient.destroy()])
    }, TIMEOUT)

    describe('private stream', () => {
        let stream: Stream

        beforeAll(async () => {
            stream = await createStreamWithPermissions(publisherPk, {
                permissions: [StreamPermission.SUBSCRIBE],
                userId: subscriberWallet.address
            })
        }, TIMEOUT * 2)

        it(
            'messages are published encrypted',
            async () => {
                await publisherClient.publish(stream.id, PAYLOAD)
                const messages = await startNetworkNodeAndListenForAtLeastOneMessage(stream.id)
                expect(messages).toHaveLength(1)
                expect(messages[0]).toBeInstanceOf(Uint8Array)
            },
            TIMEOUT
        )

        it(
            'subscriber is able to receive and decrypt messages',
            async () => {
                const messages: any[] = []
                await publisherClient.publish(stream.id, PAYLOAD)
                await subscriberClient.subscribe(stream.id, (msg: any) => {
                    messages.push(msg)
                })
                await until(() => messages.length > 0, TIMEOUT)
                expect(messages).toEqual([PAYLOAD])
            },
            TIMEOUT
        )
    })

    describe('public stream', () => {
        let stream: Stream

        beforeAll(async () => {
            stream = await createStreamWithPermissions(publisherPk, {
                permissions: [StreamPermission.SUBSCRIBE],
                public: true
            })
        }, TIMEOUT)

        it(
            'messages are published unencrypted',
            async () => {
                await publisherClient.publish(stream.id, PAYLOAD)
                const messages = await startNetworkNodeAndListenForAtLeastOneMessage(stream.id)
                expect(messages).toEqual([PAYLOAD])
            },
            TIMEOUT
        )

        it(
            'subscriber is able to receive messages',
            async () => {
                const messages: unknown[] = []
                await subscriberClient.subscribe(stream.id, (msg: any) => {
                    messages.push(msg)
                })
                await publisherClient.publish(stream.id, PAYLOAD)
                await until(() => messages.length > 0, TIMEOUT)
                expect(messages).toEqual([PAYLOAD])
            },
            TIMEOUT
        )
    })
})
