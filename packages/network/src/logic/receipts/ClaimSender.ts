import { BucketCollector } from './BucketCollector'
import { NodeId } from '../../identifiers'
import { Logger } from '../../helpers/Logger'
import { Bucket, BucketID, getWindowStartTime, WINDOW_LENGTH } from './Bucket'
import { NodeToNode } from '../../protocol/NodeToNode'
import { PeerInfo } from '../../connection/PeerInfo'
import { ReceiptRequest, StreamMessage, StreamPartIDUtils } from 'streamr-client-protocol'
import { v4 as uuidv4 } from 'uuid'
import { Claim } from 'streamr-client-protocol'

function createClaim(bucket: Bucket, sender: NodeId): Claim {
    const [streamId, streamPartition] = StreamPartIDUtils.getStreamIDAndPartition(bucket.getStreamPartId())
    return {
        streamId,
        streamPartition,
        publisherId: bucket.getPublisherId(),
        msgChainId: bucket.getMsgChainId(),
        windowNumber: bucket.getWindowNumber(),
        messageCount: bucket.getMessageCount(),
        totalPayloadSize: bucket.getTotalPayloadSize(),
        receiver: bucket.getPublisherId(),
        sender, // TODO: without sessionId
    }
}

const WINDOW_TIMEOUT = WINDOW_LENGTH * 2
const UPDATE_TIMEOUT = WINDOW_LENGTH * 2

function getCloseTime(bucket: Bucket): number {
    return Math.max(
        getWindowStartTime(bucket.getWindowNumber() + 1) + WINDOW_TIMEOUT,
        bucket.getLastUpdate() + UPDATE_TIMEOUT
    )
}

const logger = new Logger(module)

export class ClaimSender {
    private readonly myNodeId: NodeId
    private readonly nodeToNode: NodeToNode
    private readonly collector: BucketCollector
    private readonly closeTimeouts = new Map<BucketID, NodeJS.Timeout>() // TODO: browser setTimeout?

    constructor(myPeerInfo: PeerInfo, nodeToNode: NodeToNode) {
        this.myNodeId = myPeerInfo.peerId
        this.nodeToNode = nodeToNode
        this.collector = new BucketCollector((bucket) => { // TODO: debounce?
            const existingTimeout = this.closeTimeouts.get(bucket.getId())
            if (existingTimeout !== undefined) {
                clearTimeout(existingTimeout)
            }
            const timeoutRef = setTimeout(() => {
                this.sendReceiptRequest(bucket)
                this.collector.removeBucket(bucket.getId())
                logger.info('closed bucket %s', bucket.getId())
            }, getCloseTime(bucket) - Date.now())
            this.closeTimeouts.set(bucket.getId(), timeoutRef)
        })
    }

    recordMessageSent(recipient: NodeId, streamMessage: StreamMessage): void {
        this.collector.record(streamMessage, recipient)
    }

    stop(): void {
        for (const timeout of this.closeTimeouts.values()) {
            clearTimeout(timeout)
        }
        this.closeTimeouts.clear()
    }

    private sendReceiptRequest(bucket: Bucket): void {
        this.nodeToNode.send(bucket.getNodeId(), new ReceiptRequest({
            requestId: uuidv4(),
            claim: createClaim(bucket, this.myNodeId),
            signature: 'nönönö' // TODO: signing
        })).catch((e) => {
            logger.warn('failed to send ReceiptRequest to %s, reason: %s', bucket.getNodeId(), e)
        })
    }
}
