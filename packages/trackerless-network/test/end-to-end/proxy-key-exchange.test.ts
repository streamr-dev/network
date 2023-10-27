import {
    ContentType,
    EncryptionType,
    GroupKeyRequest,
    GroupKeyResponse,
    MessageID,
    StreamMessage,
    StreamMessageType,
    StreamPartIDUtils
} from '@streamr/protocol'
import { hexToBinary, toEthereumAddress, utf8ToBinary, waitForEvent3 } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('proxy-test#0')

describe('proxy group key exchange', () => {
    const proxyNodeDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 23134, tls: false }
    })
    const publisherDescriptor = createMockPeerDescriptor()
    const subscriberDescriptor = createMockPeerDescriptor()

    const publisherUserId = toEthereumAddress('0x823A026e226EB47980c88616e01E1D3305Ef8Ecb')
    const subscriberUserId = toEthereumAddress('0x73E6183bf9b79D30533bEC7B28e982e9Af649B23')

    let proxyNode: NetworkNode
    let publisher: NetworkNode
    let subscriber: NetworkNode

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
        proxyNode.setStreamPartEntryPoints(STREAM_PART_ID, [proxyNodeDescriptor])
        proxyNode.stack.getStreamrNode()!.joinStreamPart(STREAM_PART_ID)
        publisher = createNetworkNode({
            layer0: {
                entryPoints: [publisherDescriptor],
                peerDescriptor: publisherDescriptor,
            }
        })
        await publisher.start(false)

        subscriber = createNetworkNode({
            layer0: {
                entryPoints: [subscriberDescriptor],
                peerDescriptor: subscriberDescriptor,
            }
        })
        await subscriber.start(false)
    })

    afterEach(async () => {
        await proxyNode.stop()
        await publisher.stop()
        await subscriber.stop()
    })
    
    it('happy path request', async () => {
        await publisher.setProxies(STREAM_PART_ID, [proxyNodeDescriptor], ProxyDirection.PUBLISH, publisherUserId)
        await subscriber.setProxies(STREAM_PART_ID, [proxyNodeDescriptor], ProxyDirection.SUBSCRIBE, subscriberUserId)

        const requestContent = utf8ToBinary(new GroupKeyRequest({
            recipient: publisherUserId,
            requestId: 'requestId',
            rsaPublicKey: 'mockKey',
            groupKeyIds: [
                'mock'
            ],
        }).serialize())
        const request = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(STREAM_PART_ID),
                StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
                Date.now(),
                0,
                subscriberUserId,
                '0'
            ),
            messageType: StreamMessageType.GROUP_KEY_REQUEST,
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE,
            content: requestContent,
            signature: hexToBinary('1234')
        })

        await Promise.all([
            waitForEvent3(publisher.stack.getStreamrNode()! as any, 'newMessage'),
            subscriber.broadcast(request)
        ])
    })

    it('happy path response', async () => {
        await publisher.setProxies(STREAM_PART_ID, [proxyNodeDescriptor], ProxyDirection.PUBLISH, publisherUserId)
        await subscriber.setProxies(STREAM_PART_ID, [proxyNodeDescriptor], ProxyDirection.SUBSCRIBE, subscriberUserId)

        const responseContent = utf8ToBinary(new GroupKeyResponse({
            recipient: publisherUserId,
            requestId: 'requestId',
            encryptedGroupKeys: []
        }).serialize())
        const response = new StreamMessage({
            messageId: new MessageID(
                StreamPartIDUtils.getStreamID(STREAM_PART_ID),
                StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
                Date.now(),
                0,
                publisherUserId,
                '0'
            ),
            messageType: StreamMessageType.GROUP_KEY_RESPONSE,
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.RSA,
            content: responseContent,
            signature: hexToBinary('1234')
        })

        await Promise.all([
            waitForEvent3(subscriber.stack.getStreamrNode()! as any, 'newMessage'),
            publisher.broadcast(response)
        ])
    })
})
