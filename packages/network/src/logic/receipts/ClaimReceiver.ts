import { BucketCollector } from './BucketCollector'
import { Claim, ReceiptRequest, ReceiptResponse, toStreamPartID } from 'streamr-client-protocol'
import { Event as NodeToNodeEvent, NodeToNode } from '../../protocol/NodeToNode'
import { Logger } from '../../helpers/Logger'
import { PeerInfo } from '../../connection/PeerInfo'
import { NodeId } from '../../identifiers'
import { BucketID, formBucketID } from './Bucket'
import { v4 as uuidv4 } from 'uuid'
import { SignatureFunctions } from './SignatureFunctions'

const logger = new Logger(module)

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
    private readonly signatureFunctions: SignatureFunctions
    private readonly collector: BucketCollector

    constructor(myPeerInfo: PeerInfo, nodeToNode: NodeToNode, signatureFunctions: SignatureFunctions) {
        this.myNodeId = myPeerInfo.peerId
        this.nodeToNode = nodeToNode
        this.signatureFunctions = signatureFunctions
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
        if (!this.signatureFunctions.validateClaim(claim, signature)) {
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
            this.sendReceiptResponse(claim, signature)
        } else {
            logger.info("I disagree with %j (msgCount=%d, totalPayloadSize=%d)",
                claim,
                bucket.getMessageCount(),
                bucket.getTotalPayloadSize()
            )
        }
    }

    private sendReceiptResponse(claim: Claim, senderSignature: string): void {
        this.nodeToNode.send(claim.sender, new ReceiptResponse({
            requestId: uuidv4(),
            claim,
            signature: this.signatureFunctions.signSignedClaim(claim, senderSignature)
        })).catch((e) => {
            logger.warn('failed to send ReceiptResponse to %s, reason: %s', claim.sender, e)
        })
    }
}
