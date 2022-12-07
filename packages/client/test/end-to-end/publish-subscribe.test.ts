import { Wallet } from 'ethers'
import { StreamID, toStreamPartID } from '@streamr/protocol'
import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { PermissionAssignment, StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { createTestStream } from '../test-utils/utils'
import { waitForCondition } from '@streamr/utils'
import { NetworkNode } from '@streamr/trackerless-network'
import { PeerDescriptor, PeerID } from '@streamr/dht'
import { JsonPeerDescriptor } from '../../src/Config'

const TIMEOUT = 20 * 1000

const PAYLOAD = { hello: 'world' }

const ENCRYPTED_MESSSAGE_FORMAT = /^[0-9A-Fa-f]+$/

async function startNetworkNodeAndListenForAtLeastOneMessage(streamId: StreamID, entryPoint: JsonPeerDescriptor): Promise<unknown[]> {
    const epDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(entryPoint.kademliaId).value,
        type: entryPoint.type,
        websocket: entryPoint.websocket
    }
    const networkNode = new NetworkNode({
        // TODO better typing for ConfigTest.network.trackers?
        ...CONFIG_TEST.network as any,
        entryPoints: [epDescriptor],
        stringKademliaId: 'node'
    })

    try {
        await networkNode.start()
        networkNode.subscribe(toStreamPartID(streamId, 0), epDescriptor)
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
        const publisherDescriptor = {
            kademliaId: PeerID.fromString('publisher').toString(),
            type: 0,
            websocket: {
                ip: 'localhost',
                port: 15656
            }
        }
        publisherClient = new StreamrClient({
            ...CONFIG_TEST,
            auth: {
                privateKey: publisherPk
            },
            network: {
                entryPoints: [publisherDescriptor],
                peerDescriptor: publisherDescriptor
            }
        })
        subscriberClient = new StreamrClient({
            ...CONFIG_TEST,
            auth: {
                privateKey: subscriberWallet.privateKey
            },
            network: {
                entryPoints: [publisherDescriptor],
                stringKademliaId: 'subscriber'
            }
        })

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
        }, TIMEOUT)

        it('messages are published encrypted', async () => {
            await publisherClient.publish(stream.id, PAYLOAD)
            const messages = await startNetworkNodeAndListenForAtLeastOneMessage(
                stream.id,
                {
                    kademliaId: PeerID.fromString('publisher').toString(),
                    type: 0,
                    websocket: {
                        ip: 'localhost',
                        port: 15656
                    }
                }
            )
            expect(messages).toHaveLength(1)
            expect(messages[0]).toMatch(ENCRYPTED_MESSSAGE_FORMAT)
        }, TIMEOUT)

        it('subscriber is able to receive and decrypt messages', async () => {
            const messages: any[] = []
            await publisherClient.publish(stream.id, PAYLOAD)
            const sub = await subscriberClient.subscribe(stream.id, (msg: any) => {
                messages.push(msg)
            })
            sub.on('error', (e) =>  console.error(e))
            await waitForCondition(() => messages.length > 0, 10000)
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
            const messages = await startNetworkNodeAndListenForAtLeastOneMessage(
                stream.id,
                {
                    kademliaId: PeerID.fromString('publisher').toString(),
                    type: 0,
                    websocket: {
                        ip: 'localhost',
                        port: 15656
                    }
                }
            )
            expect(messages).toEqual([PAYLOAD])
        }, TIMEOUT)

        it('subscriber is able to receive messages', async () => {
            const messages: unknown[] = []
            await publisherClient.publish(stream.id, PAYLOAD)
            await subscriberClient.subscribe(stream.id, (msg: any) => {
                messages.push(msg)
            })
            await waitForCondition(() => messages.length > 0, 10000)
            expect(messages).toEqual([PAYLOAD])
        }, TIMEOUT)
    })
})
