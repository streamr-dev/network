import { BucketStatsCollector } from './BucketStatsCollector'
import { BucketStatsAnalyzer } from './BucketStatsAnalyzer'
import { v4 as uuidv4 } from 'uuid'
import { ReceiptRequest, StreamMessage, StreamPartIDUtils, toStreamPartID } from 'streamr-client-protocol'
import { Event as NodeToNodeEvent, NodeToNode } from '../../protocol/NodeToNode'
import { Logger } from '../../helpers/Logger'
import { StreamPartManager } from '../StreamPartManager'
import { PeerInfo } from '../../connection/PeerInfo'
import { Claim } from 'streamr-client-protocol/dist/src/protocol/control_layer/receipt_request/ReceiptRequest'
import { NodeId } from '../../identifiers'
import { BucketStats } from './BucketStats'

const logger = new Logger(module)

const ANALYZE_INTERVAL_IN_MS = 30 * 1000

export function createClaim(bucket: BucketStats, sender: NodeId, receiver: NodeId): Claim {
    const [streamId, streamPartition] = StreamPartIDUtils.getStreamIDAndPartition(bucket.getStreamPartId())
    return {
        streamId,
        streamPartition,
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
        nodeToNode.on(NodeToNodeEvent.RECEIPT_REQUEST_RECEIVED, this.onReceiptRequest.bind(this))
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

    private onReceiptRequest(receiptRequest: ReceiptRequest, nodeId: NodeId): void {
        const claim = receiptRequest.claim
        if (nodeId !== claim.sender) {
            logger.warn('received ReceiptRequest where claim.sender does not match sender identity')
            return
        }
        // TODO: validate signature
        const claimStreamPartId = toStreamPartID(claim.streamId, claim.streamPartition) // TODO: handle catch
        const bucket = this.receivedCollector.getBuckets(nodeId).find((b) => {
            return b.getStreamPartId() === claimStreamPartId
                && b.getPublisherId() === claim.publisherId
                && b.getMsgChainId() === claim.msgChainId
                && b.getWindowNumber() === claim.windowNumber
        })
        if (bucket === undefined) {
            logger.warn('bucket not found for %j', claim)
            return
        }
        // TODO: inequality instead?
        if (bucket.getMessageCount() === claim.messageCount && bucket.getTotalPayloadSize() === claim.totalPayloadSize) {
            logger.info("I agree with %j", claim)
        } else {
            logger.info("I disagree with %j (msgCount=%d, totalPayloadSize=%d)",
                claim,
                bucket.getMessageCount(),
                bucket.getTotalPayloadSize()
            )
        }
    }

}
