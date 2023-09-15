import { NodeType, PeerDescriptor } from '@streamr/dht'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { MessageID, MessageRef, StreamID, StreamMessage, StreamMessageType, toStreamID, toStreamPartID } from '@streamr/protocol'
import { waitForEvent3, hexToBinary, utf8ToBinary } from '@streamr/utils'
import { ProxyDirection, StreamMessage as InternalStreamMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { StreamNodeType } from '../../src/logic/StreamrNode'
import { randomEthereumAddress } from '@streamr/test-utils'
import { createRandomNodeId } from '../utils/utils'

const PROXIED_NODE_USER_ID = randomEthereumAddress()

const createMessage = (streamId: StreamID): StreamMessage => {
    return new StreamMessage({ 
        messageId: new MessageID(
            streamId,
            0,
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
        signature: hexToBinary('0x1234'),
    })
}

describe('proxy and full node', () => {

    const proxyNodeDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS,
        nodeName: 'proxyNode',
        websocket: { ip: 'localhost', port: 23135 }
    }
    const proxiedNodeDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS,
    }

    const proxyStreamId = toStreamPartID(toStreamID('proxy-stream'), 0)
    const regularStreamId1 = toStreamPartID(toStreamID('regular-stream1'), 0)
    const regularStreamId2 = toStreamPartID(toStreamID('regular-stream2'), 0)
    const regularStreamId3 = toStreamPartID(toStreamID('regular-stream3'), 0)
    const regularStreamId4 = toStreamPartID(toStreamID('regular-stream4'), 0)

    const proxiedMessage = createMessage(toStreamID('proxy-stream'))
    const regularMessage1 = createMessage(toStreamID('regular-stream1'))
    const regularMessage2 = createMessage(toStreamID('regular-stream2'))
    const regularMessage3 = createMessage(toStreamID('regular-stream3'))
    const regularMessage4 = createMessage(toStreamID('regular-stream4'))

    let proxyNode: NetworkNode
    let proxiedNode: NetworkNode

    beforeEach(async () => {
        proxyNode = createNetworkNode({
            layer0: {
                entryPoints: [proxyNodeDescriptor],
                peerDescriptor: proxyNodeDescriptor,
            },
            networkNode: {
                acceptProxyConnections: true
            }
        })
        await proxyNode.start()
        await proxyNode.stack.getStreamrNode()!.joinStream(proxyStreamId)
        await proxyNode.stack.getStreamrNode()!.joinStream(regularStreamId1)
        await proxyNode.stack.getStreamrNode()!.joinStream(regularStreamId2)
        await proxyNode.stack.getStreamrNode()!.joinStream(regularStreamId3)
        await proxyNode.stack.getStreamrNode()!.joinStream(regularStreamId4)

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

    it('proxied node can act as full node on another stream', async () => {
        await proxiedNode.setProxies(proxyStreamId, [proxyNodeDescriptor], ProxyDirection.PUBLISH, PROXIED_NODE_USER_ID, 1)
        expect(proxiedNode.stack.getLayer0DhtNode().hasJoined()).toBe(false)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.publish(regularMessage1)
        ])

        expect(proxiedNode.stack.getLayer0DhtNode().hasJoined()).toBe(true)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.publish(proxiedMessage)
        ])

        expect(proxiedNode.stack.getStreamrNode().getStream(proxyStreamId)!.type).toBe(StreamNodeType.PROXY)
        expect(proxiedNode.stack.getStreamrNode().getStream(regularStreamId1)!.type).toBe(StreamNodeType.RANDOM_GRAPH)
    })

    it('proxied node can act as full node on multiple streams', async () => {
        await proxiedNode.setProxies(proxyStreamId, [proxyNodeDescriptor], ProxyDirection.PUBLISH, PROXIED_NODE_USER_ID, 1)
        expect(proxiedNode.stack.getLayer0DhtNode().hasJoined()).toBe(false)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage', 5000, 
                (streamMessage: InternalStreamMessage) => streamMessage.messageId!.streamId === 'regular-stream1'),
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage', 5000, 
                (streamMessage: InternalStreamMessage) => streamMessage.messageId!.streamId === 'regular-stream2'),
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage', 5000, 
                (streamMessage: InternalStreamMessage) => streamMessage.messageId!.streamId === 'regular-stream3'),
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage', 5000, 
                (streamMessage: InternalStreamMessage) => streamMessage.messageId!.streamId === 'regular-stream4'),
            proxiedNode.publish(regularMessage1),
            proxiedNode.publish(regularMessage2),
            proxiedNode.publish(regularMessage3),
            proxiedNode.publish(regularMessage4)
        ])

        expect(proxiedNode.stack.getLayer0DhtNode().hasJoined()).toBe(true)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.publish(proxiedMessage)
        ])

        expect(proxiedNode.stack.getStreamrNode().getStream(proxyStreamId)!.type).toBe(StreamNodeType.PROXY)
        expect(proxiedNode.stack.getStreamrNode().getStream(regularStreamId1)!.type).toBe(StreamNodeType.RANDOM_GRAPH)
        expect(proxiedNode.stack.getStreamrNode().getStream(regularStreamId2)!.type).toBe(StreamNodeType.RANDOM_GRAPH)
        expect(proxiedNode.stack.getStreamrNode().getStream(regularStreamId3)!.type).toBe(StreamNodeType.RANDOM_GRAPH)
        expect(proxiedNode.stack.getStreamrNode().getStream(regularStreamId4)!.type).toBe(StreamNodeType.RANDOM_GRAPH)
    })

})
