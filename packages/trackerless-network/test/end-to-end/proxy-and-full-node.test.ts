import { NodeType, PeerDescriptor, PeerID } from "@streamr/dht"
import { NetworkNode } from "../../src/NetworkNode"
import { MessageID, MessageRef, StreamMessage, StreamMessageType, toStreamID, toStreamPartID } from "@streamr/protocol"
import { EthereumAddress, waitForEvent3 } from "@streamr/utils"
import { ProxyDirection } from "../../src/proto/packages/trackerless-network/protos/NetworkRpc"

describe('proxy and full node', () => {

    const proxyNodeDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`proxyNode`).value,
        type: NodeType.NODEJS,
        nodeName: 'proxyNode',
        websocket: { ip: 'localhost', port: 23132 }
    }
    const proxiedNodeDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`proxiedNode`).value,
        type: NodeType.NODEJS,
    }

    const proxyStreamId = toStreamPartID(toStreamID('proxy-stream'), 0)
    const regularStreamId = toStreamPartID(toStreamID('regular-stream'), 0)

    const proxiedMessage = new StreamMessage({
        messageId: new MessageID(
            toStreamID('proxy-stream'),
            0,
            666,
            0,
            'peer' as EthereumAddress,
            'msgChainId'
        ),
        prevMsgRef: new MessageRef(665, 0),
        content: {
            hello: 'world'
        },
        messageType: StreamMessageType.MESSAGE,
        signature: 'signature',
    })

    const regularMessage = new StreamMessage({
        messageId: new MessageID(
            toStreamID('regular-stream'),
            0,
            666,
            0,
            'peer' as EthereumAddress,
            'msgChainId'
        ),
        prevMsgRef: new MessageRef(665, 0),
        content: {
            hello: 'world'
        },
        messageType: StreamMessageType.MESSAGE,
        signature: 'signature',
    })

    let proxyNode: NetworkNode
    let proxiedNode: NetworkNode

    beforeEach(async () => {
        proxyNode = new NetworkNode({
            layer0: {
                entryPoints: [proxyNodeDescriptor],
                peerDescriptor: proxyNodeDescriptor,
            },
            networkNode: {
                acceptProxyConnections: true
            }
        })
        await proxyNode.start()
        await proxyNode.stack.getStreamrNode()!.joinStream(proxyStreamId, [proxyNodeDescriptor])
        await proxyNode.stack.getStreamrNode()!.joinStream(regularStreamId, [proxyNodeDescriptor])

        proxiedNode = new NetworkNode({
            layer0: {
                entryPoints: [proxyNodeDescriptor],
                peerDescriptor: proxiedNodeDescriptor,
            },
            networkNode: {}
        })
        await proxiedNode.start(false)
    })

    afterEach(async () => {
        await proxyNode.stop()
        await proxiedNode.stop()
    })

    it('proxied node can act as full node on another stream', async () => {
        await proxiedNode.setProxies(proxyStreamId, [proxyNodeDescriptor], ProxyDirection.PUBLISH, async () => 'proxiedNode', 1)
        expect(proxiedNode.stack.getLayer0DhtNode().hasJoined()).toBe(false)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.publish(regularMessage, [proxyNodeDescriptor])
        ])

        expect(proxiedNode.stack.getLayer0DhtNode().hasJoined()).toBe(true)

        await Promise.all([
            waitForEvent3(proxyNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.publish(proxiedMessage, [])
        ])

    })

})
