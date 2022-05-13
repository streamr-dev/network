import { BucketCollector } from './BucketCollector'
import { Claim, ReceiptRequest, ReceiptResponse, RefusalCode, toStreamPartID } from 'streamr-client-protocol'
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

    private onReceiptRequest({ claim, signature: senderSignature }: ReceiptRequest, source: NodeId): void {
        if (source !== claim.sender) {
            logger.warn('identity mismatch: source of message !== claim.sender')
            this.sendRefusalReceiptResponse(claim, RefusalCode.SENDER_IDENTITY_MISMATCH)
            return
        }
        if (!this.signatureFunctions.validateClaim(claim, senderSignature)) {
            logger.warn('signature validation failed for %j', claim)
            this.sendRefusalReceiptResponse(claim, RefusalCode.INVALID_SIGNATURE)
            return
        }
        const bucket = this.collector.getBucket(getBucketIdFromClaim(claim))
        if (bucket === undefined) {
            logger.warn('bucket not found for %j', claim)
            this.sendRefusalReceiptResponse(claim, RefusalCode.BUCKET_NOT_FOUND)
            return
        }
        // TODO: inequality instead?
        if (bucket.getMessageCount() !== claim.messageCount || bucket.getTotalPayloadSize() !== claim.totalPayloadSize) {
            logger.warn("I disagree with %j (msgCount=%d, totalPayloadSize=%d)",
                claim,
                bucket.getMessageCount(),
                bucket.getTotalPayloadSize()
            )
            this.sendRefusalReceiptResponse(claim, RefusalCode.DISAGREEMENT)
            return
        }

        logger.info("I agree with %j", claim)
        this.sendAgreementReceiptResponse(claim, senderSignature)
    }

    private sendAgreementReceiptResponse(claim: Claim, senderSignature: string): void {
        this.nodeToNode.send(claim.sender, new ReceiptResponse({
            requestId: uuidv4(),
            claim,
            signature: this.signatureFunctions.signSignedClaim(claim, senderSignature)
        })).catch((e) => {
            logger.warn('failed to send ReceiptResponse(signature) to %s, reason: %s', claim.sender, e)
        })
    }

    private sendRefusalReceiptResponse(claim: Claim, refusalCode: RefusalCode): void {
        this.nodeToNode.send(claim.sender, new ReceiptResponse({
            requestId: uuidv4(),
            claim,
            refusalCode
        })).catch((e) => {
            logger.warn('failed to send ReceiptResponse(refusal) to %s, reason: %s', claim.sender, e)
        })
    }
}
