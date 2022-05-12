import { BucketStats, BucketStatsCollector } from './BucketStatsCollector'
import { BucketStatsAnalyzer } from './BucketStatsAnalyzer'
import { v4 as uuidv4 } from 'uuid'
import { ReceiptRequest, StreamMessage, StreamPartIDUtils } from 'streamr-client-protocol'
import { Event as NodeToNodeEvent, NodeToNode } from '../../protocol/NodeToNode'
import { Logger } from '../../helpers/Logger'
import { StreamPartManager } from '../StreamPartManager'
import { PeerInfo } from '../../connection/PeerInfo'
import { Claim } from 'streamr-client-protocol/dist/src/protocol/control_layer/receipt_request/ReceiptRequest'
import { NodeId } from '../../identifiers'

const logger = new Logger(module)

const ANALYZE_INTERVAL_IN_MS = 30 * 1000

export function createClaim(bucket: BucketStats, sender: NodeId, receiver: NodeId): Claim {
    return {
        streamId: StreamPartIDUtils.getStreamID(bucket.getStreamPartId()),
        streamPartition: StreamPartIDUtils.getStreamPartition(bucket.getStreamPartId()),
        publisherId: bucket.getPublisherId(),
        msgChainId: bucket.getMsgChainId(),
        windowNumber: bucket.getWindowNumber(),
        messageCount: bucket.getMessageCount(),
        totalPayloadSize: bucket.getTotalPayloadSize(),
        sender, // TODO: without sessionId
        receiver
    }
}

export class ReceiptHandler {
    private readonly receivedCollector = new BucketStatsCollector()    // collect messages I receive
    private readonly sentCollector = new BucketStatsCollector()        // collect message I send
    private readonly myNodeId: NodeId
    private readonly nodeToNode: NodeToNode
    private readonly analyzer: BucketStatsAnalyzer

    constructor(myPeerInfo: PeerInfo, nodeToNode: NodeToNode, streamPartManager: StreamPartManager) {
        this.myNodeId = myPeerInfo.peerId
        this.nodeToNode = nodeToNode
        this.analyzer = new BucketStatsAnalyzer(
            streamPartManager.getAllNodes.bind(streamPartManager),
            this.sentCollector,
            ANALYZE_INTERVAL_IN_MS,
            this.sendReceiptRequest.bind(this)
        )
        nodeToNode.on(NodeToNodeEvent.DATA_RECEIVED, (broadcastMessage, nodeId) => {
            this.receivedCollector.record(nodeId, broadcastMessage.streamMessage)
        })
        nodeToNode.on(NodeToNodeEvent.RECEIPT_REQUEST_RECEIVED, (receiptRequest, nodeId) => {
            this.receivedCollector.getBuckets(nodeId)
        })
    }

    async start(): Promise<void> {
        await this.analyzer.start()
    }

    stop(): void {
        this.analyzer.stop()
    }

    recordMessageSent(recipient: NodeId, streamMessage: StreamMessage): void {
        this.sentCollector.record(recipient, streamMessage)
    }

    private async sendReceiptRequest(nodeId: NodeId, bucket: BucketStats): Promise<void> {
        try {
            await this.nodeToNode.send(nodeId, new ReceiptRequest({
                requestId: uuidv4(),
                claim: createClaim(bucket, this.myNodeId, nodeId),
                signature: 'nönönö' // TODO: signing
            }))
        } catch (e) {
            logger.error('failed to send ReceiptRequest to %s, reason: %s', nodeId, e)
        }
    }

}
