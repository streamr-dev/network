import { BucketCollector } from './BucketCollector'
import { ReceiptRequest } from 'streamr-client-protocol'
import { Event as NodeToNodeEvent, NodeToNode } from '../../protocol/NodeToNode'
import { Logger } from '../../helpers/Logger'
import { PeerInfo } from '../../connection/PeerInfo'
import { NodeId } from '../../identifiers'
import { getBucketID } from './Bucket'

const logger = new Logger(module)

export class ClaimReceiver {
    private readonly myNodeId: NodeId
    private readonly nodeToNode: NodeToNode
    private readonly collector: BucketCollector

    constructor(myPeerInfo: PeerInfo, nodeToNode: NodeToNode) {
        this.myNodeId = myPeerInfo.peerId
        this.nodeToNode = nodeToNode
        this.collector = new BucketCollector()
        nodeToNode.on(NodeToNodeEvent.DATA_RECEIVED, (broadcastMessage, nodeId) => {
            this.collector.record(broadcastMessage.streamMessage, nodeId)
        })
        nodeToNode.on(NodeToNodeEvent.RECEIPT_REQUEST_RECEIVED, this.onReceiptRequest.bind(this))
    }

    private onReceiptRequest(receiptRequest: ReceiptRequest, nodeId: NodeId): void {
        const claim = receiptRequest.claim
        if (nodeId !== claim.sender) {
            logger.warn('received ReceiptRequest where claim.sender does not match sender identity')
            return
        }
        // TODO: validate signature
        const bucket = this.collector.getBucket(getBucketID(claim, nodeId))
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
