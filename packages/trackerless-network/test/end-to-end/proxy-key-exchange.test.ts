import { NodeType, PeerDescriptor, PeerID } from "@streamr/dht"
import { 
    EncryptionType,
    GroupKeyRequest,
    GroupKeyResponse,
    MessageID,
    StreamMessage,
    StreamMessageType,
    StreamPartIDUtils,
    toStreamID,
    toStreamPartID
} from "@streamr/protocol"
import { NetworkNode } from "../../src/NetworkNode"
import { ProxyDirection } from "../../src/proto/packages/trackerless-network/protos/NetworkRpc"
import { toEthereumAddress, waitForEvent3 } from "@streamr/utils"

describe('proxy group key exchange', () => {
    const proxyNodeDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`proxyNode1`).value,
        type: NodeType.NODEJS,
        nodeName: 'proxyNode',
        websocket: { ip: 'localhost', port: 23134 }
    }
    const publisherDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`publisher`).value,
        type: NodeType.NODEJS,
    }
    const subscriberDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`subscriber`).value,
        type: NodeType.NODEJS,
    }

    const publisherUserId = toEthereumAddress('0x823A026e226EB47980c88616e01E1D3305Ef8Ecb')
    const subscriberUserId = toEthereumAddress('0x73E6183bf9b79D30533bEC7B28e982e9Af649B23')

    const streamPartId = toStreamPartID(toStreamID('proxy-test'), 0)

    let proxyNode: NetworkNode
    let publisher: NetworkNode
    let subscriber: NetworkNode

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
        await proxyNode.stack.getStreamrNode()!.joinStream(streamPartId, [proxyNodeDescriptor])
        publisher = new NetworkNode({
            layer0: {
                entryPoints: [publisherDescriptor],
                peerDescriptor: publisherDescriptor,
            },
            networkNode: {}
        })
        await publisher.start()

        subscriber = new NetworkNode({
            layer0: {
                entryPoints: [subscriberDescriptor],
                peerDescriptor: subscriberDescriptor,
            },
            networkNode: {}
        })
        await subscriber.start()
    })

    afterEach(async () => {
        await proxyNode.stop()
        await publisher.stop()
        await subscriber.stop()
    })
    
    it('happy path request', async () => {
        await publisher.setProxies(streamPartId, [proxyNodeDescriptor], ProxyDirection.PUBLISH, async () => publisherUserId)
        await subscriber.setProxies(streamPartId, [proxyNodeDescriptor], ProxyDirection.SUBSCRIBE, async () => subscriberUserId)

        const requestContent = new GroupKeyRequest({
            recipient: publisherUserId,
            requestId: 'requestId',
            rsaPublicKey: 'mockKey',
            groupKeyIds: [
                'mock'
            ],
        }).toArray()
        const request = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                subscriberUserId,
                '0'
            ),
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            encryptionType: EncryptionType.NONE,
            content: requestContent,
            signature: 'signature'
        })

        await Promise.all([
            waitForEvent3(publisher.stack.getStreamrNode()! as any, 'newMessage'),
            subscriber.publish(request, [proxyNodeDescriptor])
        ])
    })

    it('happy path response', async () => {
        await publisher.setProxies(streamPartId, [proxyNodeDescriptor], ProxyDirection.PUBLISH, async () => publisherUserId)
        await subscriber.setProxies(streamPartId, [proxyNodeDescriptor], ProxyDirection.SUBSCRIBE, async () => subscriberUserId)

        const responseContent = new GroupKeyResponse({
            recipient: publisherUserId,
            requestId: 'requestId',
            encryptedGroupKeys: []
        }).toArray()
        const response = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(streamPartId),
                StreamPartIDUtils.getStreamPartition(streamPartId),
                Date.now(),
                0,
                publisherUserId,
                '0'
            ),
            messageType: StreamMessageType.GROUP_KEY_RESPONSE,
            encryptionType: EncryptionType.RSA,
            content: responseContent,
            signature: 'signature'
        })

        await Promise.all([
            waitForEvent3(subscriber.stack.getStreamrNode()! as any, 'newMessage'),
            publisher.publish(response, [proxyNodeDescriptor])
        ])
    })
})
