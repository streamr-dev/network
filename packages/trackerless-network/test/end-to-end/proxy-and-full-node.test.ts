import {
    ContentType,
    EncryptionType,
    MessageID,
    MessageRef,
    StreamMessage,
    StreamMessageType,
    StreamPartID,
    StreamPartIDUtils
} from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { hexToBinary, utf8ToBinary, waitForEvent3 } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { StreamMessage as InternalStreamMessage, ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const PROXIED_NODE_USER_ID = randomEthereumAddress()

const createMessage = (streamPartId: StreamPartID): StreamMessage => {
    return new StreamMessage({ 
        messageId: new MessageID(
            StreamPartIDUtils.getStreamID(streamPartId),
            StreamPartIDUtils.getStreamPartition(streamPartId),
            666,
            0,
            randomEthereumAddress(),
            'msgChainId'
        ),
        prevMsgRef: new MessageRef(665, 0),
        content: utf8ToBinary(JSON.stringify({
            hello: 'world'
        })),
        messageType: StreamMessageType.MESSAGE,
        contentType: ContentType.JSON,
        encryptionType: EncryptionType.NONE,
        signature: hexToBinary('0x1234'),
    })
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
        proxyNode.stack.getStreamrNode()!.joinStreamPart(proxiedStreamPart)
        proxyNode.stack.getStreamrNode()!.joinStreamPart(regularStreamPart1)
        proxyNode.stack.getStreamrNode()!.joinStreamPart(regularStreamPart2)
        proxyNode.stack.getStreamrNode()!.joinStreamPart(regularStreamPart3)
        proxyNode.stack.getStreamrNode()!.joinStreamPart(regularStreamPart4)

        proxiedNode = createNetworkNode({
            layer0: {
                entryPoints: [proxyNodeDescriptor],
                peerDescriptor: proxiedNodeDescriptor,
            }
        })
        await proxiedNode.start(false)
    })

    afterEach(async () => {
        await proxyNode.stop()
        await proxiedNode.stop()
    })

    it('proxied node can act as full node on another stream part', async () => {
        await proxiedNode.setProxies(proxiedStreamPart, [proxyNodeDescriptor], ProxyDirection.PUBLISH, PROXIED_NODE_USER_ID, 1)
        expect(proxiedNode.stack.getLayer0Node().hasJoined()).toBe(false)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.broadcast(createMessage(regularStreamPart1))
        ])

        expect(proxiedNode.stack.getLayer0Node().hasJoined()).toBe(true)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.broadcast(createMessage(proxiedStreamPart))
        ])

        expect(proxiedNode.stack.getStreamrNode().getStreamPartDelivery(proxiedStreamPart)!.proxied).toBe(true)
        expect(proxiedNode.stack.getStreamrNode().getStreamPartDelivery(regularStreamPart1)!.proxied).toBe(false)
    })

    it('proxied node can act as full node on multiple stream parts', async () => {
        await proxiedNode.setProxies(proxiedStreamPart, [proxyNodeDescriptor], ProxyDirection.PUBLISH, PROXIED_NODE_USER_ID, 1)
        expect(proxiedNode.stack.getLayer0Node().hasJoined()).toBe(false)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage', 5000, 
                (streamMessage: InternalStreamMessage) => streamMessage.messageId!.streamId === StreamPartIDUtils.getStreamID(regularStreamPart1)),
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage', 5000, 
                (streamMessage: InternalStreamMessage) => streamMessage.messageId!.streamId === StreamPartIDUtils.getStreamID(regularStreamPart2)),
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage', 5000, 
                (streamMessage: InternalStreamMessage) => streamMessage.messageId!.streamId === StreamPartIDUtils.getStreamID(regularStreamPart3)),
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage', 5000, 
                (streamMessage: InternalStreamMessage) => streamMessage.messageId!.streamId === StreamPartIDUtils.getStreamID(regularStreamPart4)),
            proxiedNode.broadcast(createMessage(regularStreamPart1)),
            proxiedNode.broadcast(createMessage(regularStreamPart2)),
            proxiedNode.broadcast(createMessage(regularStreamPart3)),
            proxiedNode.broadcast(createMessage(regularStreamPart4))
        ])

        expect(proxiedNode.stack.getLayer0Node().hasJoined()).toBe(true)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.broadcast(createMessage(proxiedStreamPart))
        ])

        expect(proxiedNode.stack.getStreamrNode().getStreamPartDelivery(proxiedStreamPart)!.proxied).toBe(true)
        expect(proxiedNode.stack.getStreamrNode().getStreamPartDelivery(regularStreamPart1)!.proxied).toBe(false)
        expect(proxiedNode.stack.getStreamrNode().getStreamPartDelivery(regularStreamPart2)!.proxied).toBe(false)
        expect(proxiedNode.stack.getStreamrNode().getStreamPartDelivery(regularStreamPart3)!.proxied).toBe(false)
        expect(proxiedNode.stack.getStreamrNode().getStreamPartDelivery(regularStreamPart4)!.proxied).toBe(false)
    })

})
