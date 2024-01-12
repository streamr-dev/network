import { config as CHAIN_CONFIG } from '@streamr/config'
import { DhtAddress, NodeType, getRawFromDhtAddress } from '@streamr/dht'
import { StreamID, toStreamPartID } from '@streamr/protocol'
import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { createNetworkNode, NetworkNode } from '@streamr/trackerless-network'
import { waitForCondition, Logger } from '@streamr/utils'
import { Wallet } from 'ethers'
import { CONFIG_TEST, KEYSERVER_PORT } from '../../src/ConfigTest'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { PermissionAssignment, StreamPermission } from '../../src/permission'
import { createTestClient, createTestStream } from '../test-utils/utils'
import { binaryToUtf8 } from '@streamr/utils'

const logger = new Logger(module)

const TIMEOUT = 15 * 1000

const PAYLOAD = { hello: 'world' }

async function startNetworkNode(streamId: StreamID): Promise<NetworkNode> {
    const entryPoints = CHAIN_CONFIG.dev2.entryPoints.map((entryPoint) => ({
        ...entryPoint,
        nodeId: getRawFromDhtAddress(entryPoint.nodeId as DhtAddress),
        type: NodeType.NODEJS
    }))
    const networkNode = createNetworkNode({
        layer0: {
            entryPoints
        }
    })
    try {
        await networkNode.start()
        await networkNode.join(toStreamPartID(streamId, 0))
        return networkNode
    } catch (e) {
        logger.error('Failed starting NetworkNode or joining stream', { exception: e })
        throw e
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
        publisherPk = await fetchPrivateKeyWithGas(KEYSERVER_PORT)
    })

    beforeEach(async () => {
        publisherClient = createTestClient(publisherPk, 15656)
        subscriberClient = createTestClient(subscriberWallet.privateKey, 15657)
    }, TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([
            publisherClient?.destroy(),
            subscriberClient?.destroy(),
        ])
    }, TIMEOUT)

    describe('private stream', () => {
        let stream: Stream

        beforeAll(async () => {
            stream = await createStreamWithPermissions(publisherPk, {
                permissions: [StreamPermission.SUBSCRIBE],
                user: subscriberWallet.address
            })
        }, TIMEOUT * 2)

        describe('NetworkNode receiving', () => {
            let networkNode: NetworkNode

            beforeEach(async () => {
                networkNode = await startNetworkNode(stream.id)
            }, TIMEOUT)

            afterEach(async () => {
                await networkNode.stop()
            }, TIMEOUT)

            it('messages are published encrypted', (done) => {
                networkNode.addMessageListener((msg) => {
                    const message = msg.content
                    expect(message).toBeInstanceOf(Uint8Array)
                    done()
                })
                publisherClient.publish(stream.id, PAYLOAD)
            }, TIMEOUT)
        })

        it('subscriber is able to receive and decrypt messages', async () => {
            const messages: any[] = []
            await publisherClient.publish(stream.id, PAYLOAD)
            await subscriberClient.subscribe(stream.id, (msg: any) => {
                messages.push(msg)
            })
            await waitForCondition(() => messages.length > 0, TIMEOUT)
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

        describe('NetworkNode receiving', () => {
            let networkNode: NetworkNode

            beforeEach(async () => {
                networkNode = await startNetworkNode(stream.id)
            }, TIMEOUT)

            afterEach(async () => {
                await networkNode.stop()
            }, TIMEOUT)

            it('messages are published unencrypted', (done) => {
                networkNode.addMessageListener((msg) => {
                    expect(JSON.parse(binaryToUtf8(msg.content))).toEqual(PAYLOAD)
                    done()
                })
                publisherClient.publish(stream.id, PAYLOAD)
            }, TIMEOUT)
        })

        it('subscriber is able to receive messages', async () => {
            const messages: unknown[] = []
            await subscriberClient.subscribe(stream.id, (msg: any) => {
                messages.push(msg)
            })
            await publisherClient.publish(stream.id, PAYLOAD)
            await waitForCondition(() => messages.length > 0, TIMEOUT)
            expect(messages).toEqual([PAYLOAD])
        }, TIMEOUT)
    })
})
