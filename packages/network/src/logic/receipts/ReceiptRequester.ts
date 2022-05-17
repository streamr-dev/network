import { BucketCollector } from './BucketCollector'
import { NodeId } from '../../identifiers'
import { Logger } from '../../helpers/Logger'
import { Bucket, BucketID, getWindowStartTime, WINDOW_LENGTH } from './Bucket'
import { Event, NodeToNode } from '../../protocol/NodeToNode'
import { Claim, ReceiptRequest, StreamMessage, StreamPartIDUtils } from 'streamr-client-protocol'
import { v4 as uuidv4 } from 'uuid'
import { Signers } from './SignatureFunctions'

const DEFAULT_WINDOW_TIMEOUT_MARGIN = WINDOW_LENGTH * 2
const DEFAULT_UPDATE_TIMEOUT_MARGIN = WINDOW_LENGTH * 2

const logger = new Logger(module)

export interface ConstructorOptions {
    myNodeId: NodeId
    nodeToNode: NodeToNode
    signers: Signers
    windowTimeoutMargin?: number
    bucketUpdateTimeoutMargin?: number
}

export class ReceiptRequester {
    private readonly myNodeId: NodeId
    private readonly nodeToNode: NodeToNode
    private readonly signers: Signers
    private readonly windowTimeoutMargin: number
    private readonly bucketUpdateTimeoutMargin: number
    private readonly collector: BucketCollector
    private readonly closeTimeouts = new Map<BucketID, NodeJS.Timeout>() // TODO: browser setTimeout?

    constructor({
        myNodeId,
        nodeToNode,
        signers,
        windowTimeoutMargin,
        bucketUpdateTimeoutMargin
    }: ConstructorOptions) {
        this.myNodeId = myNodeId
        this.nodeToNode = nodeToNode
        this.signers = signers
        this.windowTimeoutMargin = windowTimeoutMargin || DEFAULT_WINDOW_TIMEOUT_MARGIN
        this.bucketUpdateTimeoutMargin = bucketUpdateTimeoutMargin || DEFAULT_UPDATE_TIMEOUT_MARGIN
        this.collector = new BucketCollector((bucket) => { // TODO: debounce?
            // TODO: we could use the fact that timeouts can only go later and later, therefore we don't have to
            //  clear them all the time here...
            const existingTimeout = this.closeTimeouts.get(bucket.getId())
            if (existingTimeout !== undefined) {
                clearTimeout(existingTimeout)
            }
            const timeoutRef = setTimeout(() => {
                this.sendReceiptRequest(bucket)
                this.collector.removeBucket(bucket.getId())
                logger.info('closed bucket %s', bucket.getId())
            }, this.getCloseTime(bucket) - Date.now())
            this.closeTimeouts.set(bucket.getId(), timeoutRef)
        })
        nodeToNode.on(Event.RECEIPT_RESPONSE_RECEIVED, ({ receipt, refusalCode }, source) => {
            if (refusalCode !== null) {
                logger.warn('receiver %s refused to provide receipt due to %s', source, refusalCode)
                // TODO: cut connection?
                return
            }
            const receiver = receipt!.claim.receiver
            if (receiver !== source) {
                logger.warn('unexpected receipt from %s (trying to respond on behalf of %s)', source, receiver)
                // TODO: cut connection?
                return
            }
            if (!this.signers.receipt.validate(receipt!)) {
                logger.warn('receipt from %s has invalid signature', source)
                // TODO: cut connection?
                return
            }
            logger.info("Accepted receipt %j", receipt)
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
            claim: this.createClaim(bucket)
        })).catch((e) => {
            logger.warn('failed to send ReceiptRequest to %s, reason: %s', bucket.getNodeId(), e)
        })
    }

    private getCloseTime(bucket: Bucket): number {
        return Math.max(
            getWindowStartTime(bucket.getWindowNumber() + 1) + this.windowTimeoutMargin,
            bucket.getLastUpdate() + this.bucketUpdateTimeoutMargin
        )
    }

    private createClaim(bucket: Bucket): Claim {
        const [streamId, streamPartition] = StreamPartIDUtils.getStreamIDAndPartition(bucket.getStreamPartId())
        const claim: Omit<Claim, 'signature'> = {
            streamId,
            streamPartition,
            publisherId: bucket.getPublisherId(),
            msgChainId: bucket.getMsgChainId(),
            windowNumber: bucket.getWindowNumber(),
            messageCount: bucket.getMessageCount(),
            totalPayloadSize: bucket.getTotalPayloadSize(),
            receiver: bucket.getNodeId(),
            sender: this.myNodeId
        }
        return {
            ...claim,
            signature: this.signers.claim.sign(claim)
        }
    }
}
