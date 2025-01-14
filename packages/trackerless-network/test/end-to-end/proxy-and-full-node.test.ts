import { randomUserId } from '@streamr/test-utils'
import { StreamPartID, StreamPartIDUtils, hexToBinary, toUserIdRaw, utf8ToBinary, waitForEvent3 } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import {
    ContentType,
    EncryptionType,
    ProxyDirection,
    SignatureType,
    StreamMessage
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const PROXIED_NODE_USER_ID = randomUserId()

const createMessage = (streamPartId: StreamPartID): StreamMessage => {
    return {
        messageId: {
            streamId: StreamPartIDUtils.getStreamID(streamPartId),
            streamPartition: StreamPartIDUtils.getStreamPartition(streamPartId),
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
}

describe('proxy and full node', () => {
    const proxyNodeDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 23135, tls: false }
    })
    const proxiedNodeDescriptor = createMockPeerDescriptor()
    const proxiedStreamPart = StreamPartIDUtils.parse('proxy-stream#0')
    const regularStreamPart1 = StreamPartIDUtils.parse('regular-stream1#0')
    const regularStreamPart2 = StreamPartIDUtils.parse('regular-stream2#0')
    const regularStreamPart3 = StreamPartIDUtils.parse('regular-stream3#0')
    const regularStreamPart4 = StreamPartIDUtils.parse('regular-stream4#0')
    let proxyNode: NetworkNode
    let proxiedNode: NetworkNode

    beforeEach(async () => {
        proxyNode = createNetworkNode({
            layer0: {
                entryPoints: [proxyNodeDescriptor],
                peerDescriptor: proxyNodeDescriptor,
                websocketServerEnableTls: false
            },
            networkNode: {
                acceptProxyConnections: true
            }
        })
        await proxyNode.start()
        proxyNode.stack.getContentDeliveryManager().joinStreamPart(proxiedStreamPart)
        proxyNode.stack.getContentDeliveryManager().joinStreamPart(regularStreamPart1)
        proxyNode.stack.getContentDeliveryManager().joinStreamPart(regularStreamPart2)
        proxyNode.stack.getContentDeliveryManager().joinStreamPart(regularStreamPart3)
        proxyNode.stack.getContentDeliveryManager().joinStreamPart(regularStreamPart4)

        proxiedNode = createNetworkNode({
            layer0: {
                entryPoints: [proxyNodeDescriptor],
                peerDescriptor: proxiedNodeDescriptor
            }
        })
        await proxiedNode.start(false)
    })

    afterEach(async () => {
        await proxyNode.stop()
        await proxiedNode.stop()
    })

    it('proxied node can act as full node on another stream part', async () => {
        await proxiedNode.setProxies(
            proxiedStreamPart,
            [proxyNodeDescriptor],
            ProxyDirection.PUBLISH,
            PROXIED_NODE_USER_ID,
            1
        )
        expect(proxiedNode.stack.getControlLayerNode().hasJoined()).toBe(false)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getContentDeliveryManager() as any, 'newMessage'),
            proxiedNode.broadcast(createMessage(regularStreamPart1))
        ])

        expect(proxiedNode.stack.getControlLayerNode().hasJoined()).toBe(true)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getContentDeliveryManager() as any, 'newMessage'),
            proxiedNode.broadcast(createMessage(proxiedStreamPart))
        ])

        expect(proxiedNode.stack.getContentDeliveryManager().getStreamPartDelivery(proxiedStreamPart)!.proxied).toBe(
            true
        )
        expect(proxiedNode.stack.getContentDeliveryManager().getStreamPartDelivery(regularStreamPart1)!.proxied).toBe(
            false
        )
    })

    it('proxied node can act as full node on multiple stream parts', async () => {
        await proxiedNode.setProxies(
            proxiedStreamPart,
            [proxyNodeDescriptor],
            ProxyDirection.PUBLISH,
            PROXIED_NODE_USER_ID,
            1
        )
        expect(proxiedNode.stack.getControlLayerNode().hasJoined()).toBe(false)

        await Promise.all([
            waitForEvent3(
                proxyNode.stack.getContentDeliveryManager() as any,
                'newMessage',
                5000,
                (streamMessage: StreamMessage) =>
                    streamMessage.messageId!.streamId === StreamPartIDUtils.getStreamID(regularStreamPart1)
            ),
            waitForEvent3(
                proxyNode.stack.getContentDeliveryManager() as any,
                'newMessage',
                5000,
                (streamMessage: StreamMessage) =>
                    streamMessage.messageId!.streamId === StreamPartIDUtils.getStreamID(regularStreamPart2)
            ),
            waitForEvent3(
                proxyNode.stack.getContentDeliveryManager() as any,
                'newMessage',
                5000,
                (streamMessage: StreamMessage) =>
                    streamMessage.messageId!.streamId === StreamPartIDUtils.getStreamID(regularStreamPart3)
            ),
            waitForEvent3(
                proxyNode.stack.getContentDeliveryManager() as any,
                'newMessage',
                5000,
                (streamMessage: StreamMessage) =>
                    streamMessage.messageId!.streamId === StreamPartIDUtils.getStreamID(regularStreamPart4)
            ),
            proxiedNode.broadcast(createMessage(regularStreamPart1)),
            proxiedNode.broadcast(createMessage(regularStreamPart2)),
            proxiedNode.broadcast(createMessage(regularStreamPart3)),
            proxiedNode.broadcast(createMessage(regularStreamPart4))
        ])

        expect(proxiedNode.stack.getControlLayerNode().hasJoined()).toBe(true)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getContentDeliveryManager() as any, 'newMessage'),
            proxiedNode.broadcast(createMessage(proxiedStreamPart))
        ])

        expect(proxiedNode.stack.getContentDeliveryManager().getStreamPartDelivery(proxiedStreamPart)!.proxied).toBe(
            true
        )
        expect(proxiedNode.stack.getContentDeliveryManager().getStreamPartDelivery(regularStreamPart1)!.proxied).toBe(
            false
        )
        expect(proxiedNode.stack.getContentDeliveryManager().getStreamPartDelivery(regularStreamPart2)!.proxied).toBe(
            false
        )
        expect(proxiedNode.stack.getContentDeliveryManager().getStreamPartDelivery(regularStreamPart3)!.proxied).toBe(
            false
        )
        expect(proxiedNode.stack.getContentDeliveryManager().getStreamPartDelivery(regularStreamPart4)!.proxied).toBe(
            false
        )
    })
})
