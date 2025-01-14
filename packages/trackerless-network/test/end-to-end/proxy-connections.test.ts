import { DhtAddress } from '@streamr/dht'
import { randomUserId } from '@streamr/test-utils'
import { StreamPartIDUtils, hexToBinary, toUserIdRaw, utf8ToBinary, wait, until, waitForEvent3 } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { ContentDeliveryLayerNode } from '../../src/logic/ContentDeliveryLayerNode'
import { ProxyClient } from '../../src/logic/proxy/ProxyClient'
import {
    ContentType,
    EncryptionType,
    ProxyDirection,
    SignatureType,
    StreamMessage
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const PROXIED_NODE_USER_ID = randomUserId()
const STREAM_PART_ID = StreamPartIDUtils.parse('proxy-test#0')
const MESSAGE: StreamMessage = {
    messageId: {
        streamId: StreamPartIDUtils.getStreamID(STREAM_PART_ID),
        streamPartition: StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
        timestamp: 666,
        sequenceNumber: 0,
        publisherId: toUserIdRaw(randomUserId()),
        messageChainId: 'msgChainId'
    },
    previousMessageRef: {
        timestamp: 665,
        sequenceNumber: 0
    },
    body: {
        oneofKind: 'contentMessage',
        contentMessage: {
            content: utf8ToBinary(
                JSON.stringify({
                    hello: 'world'
                })
            ),
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE
        }
    },
    signatureType: SignatureType.SECP256K1,
    signature: hexToBinary('0x1234')
}

describe('Proxy connections', () => {
    let proxyNode1: NetworkNode
    let proxyNode2: NetworkNode
    let proxiedNode: NetworkNode

    const hasConnectionFromProxy = (proxyNode: NetworkNode): boolean => {
        const delivery = proxyNode.stack.getContentDeliveryManager().getStreamPartDelivery(STREAM_PART_ID)
        return delivery !== undefined
            ? (delivery as { node: ContentDeliveryLayerNode }).node.hasProxyConnection(proxiedNode.getNodeId())
            : false
    }

    const hasConnectionToProxy = (proxyNodeId: DhtAddress, direction: ProxyDirection): boolean => {
        const client = (
            proxiedNode.stack.getContentDeliveryManager().getStreamPartDelivery(STREAM_PART_ID) as {
                client: ProxyClient
            }
        ).client
        return client.hasConnection(proxyNodeId, direction)
    }

    beforeEach(async () => {
        const proxyNodeDescriptor1 = createMockPeerDescriptor({
            websocket: { host: '127.0.0.1', port: 23132, tls: false }
        })
        const proxyNodeDescriptor2 = createMockPeerDescriptor({
            websocket: { host: '127.0.0.1', port: 23133, tls: false }
        })
        const proxiedNodeDescriptor = createMockPeerDescriptor()
        proxyNode1 = createNetworkNode({
            layer0: {
                entryPoints: [proxyNodeDescriptor1],
                peerDescriptor: proxyNodeDescriptor1,
                websocketServerEnableTls: false
            },
            networkNode: {
                acceptProxyConnections: true
            }
        })
        await proxyNode1.start()
        proxyNode1.stack.getContentDeliveryManager().joinStreamPart(STREAM_PART_ID)
        proxyNode2 = createNetworkNode({
            layer0: {
                entryPoints: [proxyNodeDescriptor1],
                peerDescriptor: proxyNodeDescriptor2,
                websocketServerEnableTls: false
            },
            networkNode: {
                acceptProxyConnections: true
            }
        })
        await proxyNode2.start()
        proxyNode2.stack.getContentDeliveryManager().joinStreamPart(STREAM_PART_ID)
        proxiedNode = createNetworkNode({
            layer0: {
                entryPoints: [proxyNode1.getPeerDescriptor()],
                peerDescriptor: proxiedNodeDescriptor
            }
        })
        await proxiedNode.start(false)
    }, 30000)

    afterEach(async () => {
        await proxyNode1.stop()
        await proxyNode2.stop()
        await proxiedNode.stop()
    })

    it('happy path publishing', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.PUBLISH,
            PROXIED_NODE_USER_ID,
            1
        )
        await Promise.all([
            waitForEvent3(proxyNode1.stack.getContentDeliveryManager() as any, 'newMessage'),
            proxiedNode.broadcast(MESSAGE)
        ])
    })

    it('happy path subscribing', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID,
            1
        )
        await Promise.all([
            waitForEvent3(proxiedNode.stack.getContentDeliveryManager() as any, 'newMessage'),
            proxyNode1.broadcast(MESSAGE)
        ])
    })

    it('can leave proxy publish connection', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.PUBLISH,
            PROXIED_NODE_USER_ID,
            1
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true)
        await proxiedNode.setProxies(STREAM_PART_ID, [], ProxyDirection.PUBLISH, PROXIED_NODE_USER_ID, 0)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(false)
        await until(() => hasConnectionFromProxy(proxyNode1) === false)
    })

    it('can leave proxy subscribe connection', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID,
            1
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true)
        await proxiedNode.setProxies(STREAM_PART_ID, [], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID, 0)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(false)
        await until(() => hasConnectionFromProxy(proxyNode1) === false)
    })

    it('can open multiple proxy connections', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor(), proxyNode2.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode2)).toBe(true)
    })

    it('can open multiple proxy connections and close one', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor(), proxyNode2.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode2)).toBe(true)
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        await until(() => hasConnectionFromProxy(proxyNode2) === false)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true)
    })

    it('can open and close all connections', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor(), proxyNode2.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode2)).toBe(true)

        await proxiedNode.setProxies(STREAM_PART_ID, [], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(false)
        await until(() => hasConnectionFromProxy(proxyNode1) === false)
        await until(() => hasConnectionFromProxy(proxyNode2) === false)
    })

    it('will reconnect if proxy node goes offline and comes back online', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        await proxyNode1.leave(STREAM_PART_ID)
        await until(() => hasConnectionToProxy(proxyNode1.getNodeId(), ProxyDirection.SUBSCRIBE))
        expect(hasConnectionFromProxy(proxyNode1)).toBe(false)
        proxyNode1.stack.getContentDeliveryManager().joinStreamPart(STREAM_PART_ID)
        await until(() => hasConnectionToProxy(proxyNode1.getNodeId(), ProxyDirection.SUBSCRIBE), 25000)
        // TODO why wait is needed?
        await wait(100)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true)
    }, 30000)

    it("can't join proxied stream part", async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.PUBLISH,
            PROXIED_NODE_USER_ID
        )
        await expect(proxiedNode.join(STREAM_PART_ID)).rejects.toThrow('Cannot join')
    })

    it("can't broadcast to subscribe-only proxied stream part", async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        await expect(proxiedNode.broadcast(MESSAGE)).rejects.toThrow('Cannot broadcast')
    })
})
