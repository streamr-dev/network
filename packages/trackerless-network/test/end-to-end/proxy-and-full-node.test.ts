import { MessageID, MessageRef, StreamID, StreamMessage, StreamMessageType, toStreamID, toStreamPartID } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { hexToBinary, utf8ToBinary, waitForEvent3 } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { StreamMessage as InternalStreamMessage, ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'

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

    const proxyNodeDescriptor = createMockPeerDescriptor({
        nodeName: 'proxyNode',
        websocket: { host: '127.0.0.1', port: 23135, tls: false }
    })
    const proxiedNodeDescriptor = createMockPeerDescriptor()

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
        proxyNode.stack.getStreamrNode()!.joinStream(proxyStreamId)
        proxyNode.stack.getStreamrNode()!.joinStream(regularStreamId1)
        proxyNode.stack.getStreamrNode()!.joinStream(regularStreamId2)
        proxyNode.stack.getStreamrNode()!.joinStream(regularStreamId3)
        proxyNode.stack.getStreamrNode()!.joinStream(regularStreamId4)

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
            proxiedNode.broadcast(regularMessage1)
        ])

        expect(proxiedNode.stack.getLayer0DhtNode().hasJoined()).toBe(true)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.broadcast(proxiedMessage)
        ])

        expect(proxiedNode.stack.getStreamrNode().getStream(proxyStreamId)!.proxied).toBe(true)
        expect(proxiedNode.stack.getStreamrNode().getStream(regularStreamId1)!.proxied).toBe(false)
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
            proxiedNode.broadcast(regularMessage1),
            proxiedNode.broadcast(regularMessage2),
            proxiedNode.broadcast(regularMessage3),
            proxiedNode.broadcast(regularMessage4)
        ])

        expect(proxiedNode.stack.getLayer0DhtNode().hasJoined()).toBe(true)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.broadcast(proxiedMessage)
        ])

        expect(proxiedNode.stack.getStreamrNode().getStream(proxyStreamId)!.proxied).toBe(true)
        expect(proxiedNode.stack.getStreamrNode().getStream(regularStreamId1)!.proxied).toBe(false)
        expect(proxiedNode.stack.getStreamrNode().getStream(regularStreamId2)!.proxied).toBe(false)
        expect(proxiedNode.stack.getStreamrNode().getStream(regularStreamId3)!.proxied).toBe(false)
        expect(proxiedNode.stack.getStreamrNode().getStream(regularStreamId4)!.proxied).toBe(false)
    })

})
