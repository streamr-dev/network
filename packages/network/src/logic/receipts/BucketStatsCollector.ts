import { StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { NodeId } from '../../composition'

export const BUCKET_LENGTH = 60 * 1000

export function getBucketNumber(timestamp: number): number {
    return Math.floor(timestamp / BUCKET_LENGTH)
}

export class BucketStats {
    private readonly streamPartId: StreamPartID
    private readonly publisherId: string
    private readonly msgChainId: string
    private readonly bucketNumber: number
    private messageCount = 0
    private totalPayloadSize = 0
    private lastUpdate = Date.now()

    constructor(includedMessage: StreamMessage) {
        this.streamPartId = includedMessage.getStreamPartID()
        this.publisherId = includedMessage.getPublisherId()
        this.msgChainId = includedMessage.getMsgChainId()
        this.bucketNumber = getBucketNumber(includedMessage.getTimestamp())
    }

    includes(message: StreamMessage): boolean {
        return this.streamPartId === message.getStreamPartID()
            && this.publisherId.toLowerCase() === message.getPublisherId().toLowerCase()
            && this.msgChainId === message.getMsgChainId()
            && this.bucketNumber === getBucketNumber(message.getTimestamp())
    }

    record(payloadSize: number): void {
        this.messageCount += 1
        this.totalPayloadSize += payloadSize
        this.lastUpdate = Date.now()
    }
}

// TODO: naive implementation w.rt. cleaning, when to clean?
export class BucketStatsCollector {
    private readonly bucketsByNode = new Map<NodeId, BucketStats[]>()

    record(neighborId: NodeId, message: StreamMessage): void {
        if (!this.bucketsByNode.has(neighborId)) {
            this.bucketsByNode.set(neighborId, [])
        }
        const buckets = this.bucketsByNode.get(neighborId)!
        let bucket = buckets.find((b) => b.includes(message))
        if (bucket === undefined) { // TODO: do not accept if too old?
            bucket = new BucketStats(message)
            buckets.push(bucket)
        }
        bucket.record(message.getSerializedContent().length)
    }

    getBuckets(neighborId: NodeId): ReadonlyArray<BucketStats> {
        return this.bucketsByNode.get(neighborId) || []
    }
}
