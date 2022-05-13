import { BucketCollector } from './BucketCollector'
import { Claim, ReceiptRequest, toStreamPartID } from 'streamr-client-protocol'
import { Event as NodeToNodeEvent, NodeToNode } from '../../protocol/NodeToNode'
import { Logger } from '../../helpers/Logger'
import { PeerInfo } from '../../connection/PeerInfo'
import { NodeId } from '../../identifiers'
import { BucketID, formBucketID } from './Bucket'

const logger = new Logger(module)

export type ValidateSignatureFn = (claim: Claim, signature: string) => boolean

function getBucketIdFromClaim(claim: Claim): BucketID {
    return formBucketID({
        nodeId: claim.sender,
        streamPartId: toStreamPartID(claim.streamId, claim.streamPartition),
        publisherId: claim.publisherId,
        msgChainId: claim.msgChainId,
        windowNumber: claim.windowNumber
    })
}

export class ClaimReceiver {
    private readonly myNodeId: NodeId
    private readonly nodeToNode: NodeToNode
    private readonly validatedSignature: ValidateSignatureFn
    private readonly collector: BucketCollector

    constructor(myPeerInfo: PeerInfo, nodeToNode: NodeToNode, validatedSignature: ValidateSignatureFn) {
        this.myNodeId = myPeerInfo.peerId
        this.nodeToNode = nodeToNode
        this.validatedSignature = validatedSignature
        this.collector = new BucketCollector()
        nodeToNode.on(NodeToNodeEvent.DATA_RECEIVED, (broadcastMessage, nodeId) => {
            this.collector.record(broadcastMessage.streamMessage, nodeId)
        })
        nodeToNode.on(NodeToNodeEvent.RECEIPT_REQUEST_RECEIVED, this.onReceiptRequest.bind(this))
    }

    private onReceiptRequest({ claim, signature }: ReceiptRequest, source: NodeId): void {
        if (source !== claim.sender) {
            logger.warn('identity mismatch: source of message !== claim.sender')
            return
        }
        if (!this.validatedSignature(claim, signature)) {
            logger.warn('signature validation failed for %j', claim)
            return
        }
        const bucket = this.collector.getBucket(getBucketIdFromClaim(claim))
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
