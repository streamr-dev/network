import { randomUserId } from '@streamr/test-utils'
import { StreamPartIDUtils, hexToBinary, toUserIdRaw, utf8ToBinary, until } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessage
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('inspect', () => {
    const publisherDescriptor = createMockPeerDescriptor({
        websocket: {
            host: '127.0.0.1',
            port: 15478,
            tls: false
        }
    })

    const inspectedDescriptor = createMockPeerDescriptor({
        websocket: {
            host: '127.0.0.1',
            port: 15479,
            tls: false
        }
    })

    const inspectorDescriptor = createMockPeerDescriptor({
        websocket: {
            host: '127.0.0.1',
            port: 15480,
            tls: false
        }
    })

    let publisherNode: NetworkNode

    let inspectedNode: NetworkNode

    let inspectorNode: NetworkNode

    const message: StreamMessage = {
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

    beforeEach(async () => {
        publisherNode = createNetworkNode({
            layer0: {
                entryPoints: [publisherDescriptor],
                peerDescriptor: publisherDescriptor,
                websocketServerEnableTls: false
            }
        })

        inspectedNode = createNetworkNode({
            layer0: {
                entryPoints: [publisherDescriptor],
                peerDescriptor: inspectedDescriptor,
                websocketServerEnableTls: false
            }
        })

        inspectorNode = createNetworkNode({
            layer0: {
                entryPoints: [publisherDescriptor],
                peerDescriptor: inspectorDescriptor,
                websocketServerEnableTls: false
            }
        })

        await publisherNode.start()
        await inspectedNode.start()
        await inspectorNode.start()

        publisherNode.stack.getContentDeliveryManager().joinStreamPart(STREAM_PART_ID)
        inspectedNode.stack.getContentDeliveryManager().joinStreamPart(STREAM_PART_ID)
        inspectorNode.stack.getContentDeliveryManager().joinStreamPart(STREAM_PART_ID)

        await until(
            () =>
                publisherNode.stack.getContentDeliveryManager().getNeighbors(STREAM_PART_ID).length === 2 &&
                inspectedNode.stack.getContentDeliveryManager().getNeighbors(STREAM_PART_ID).length === 2 &&
                inspectorNode.stack.getContentDeliveryManager().getNeighbors(STREAM_PART_ID).length === 2
        )
    }, 30000)

    afterEach(async () => {
        await Promise.all([publisherNode.stop(), inspectedNode.stop(), inspectorNode.stop()])
    })

    it('should inspect succesfully', async () => {
        setTimeout(async () => {
            await publisherNode.broadcast(message)
        }, 250)
        const success = await inspectorNode.inspect(inspectedDescriptor, STREAM_PART_ID)
        expect(success).toBe(true)
    })
})
