import { StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { NodeId } from '../../composition'

export const WINDOW_LENGTH = 60 * 1000

export function getWindowNumber(timestamp: number): number {
    return Math.floor(timestamp / WINDOW_LENGTH)
}

export function getWindowStartTime(windowNumber: number): number {
    return windowNumber * WINDOW_LENGTH
}

export class BucketStats {
    private readonly streamPartId: StreamPartID
    private readonly publisherId: string
    private readonly msgChainId: string
    private readonly windowNumber: number
    private messageCount = 0
    private totalPayloadSize = 0
    private lastUpdate = Date.now()

    constructor(includedMessage: StreamMessage) {
        this.streamPartId = includedMessage.getStreamPartID()
        this.publisherId = includedMessage.getPublisherId()
        this.msgChainId = includedMessage.getMsgChainId()
        this.windowNumber = getWindowNumber(includedMessage.getTimestamp())
    }

    includes(message: StreamMessage): boolean {
        return this.streamPartId === message.getStreamPartID()
            && this.publisherId.toLowerCase() === message.getPublisherId().toLowerCase()
            && this.msgChainId === message.getMsgChainId()
            && this.windowNumber === getWindowNumber(message.getTimestamp())
    }

    record(payloadSize: number): void {
        this.messageCount += 1
        this.totalPayloadSize += payloadSize
        this.lastUpdate = Date.now()
    }

    getStreamPartId(): StreamPartID {
        return this.streamPartId
    }

    getPublisherId(): string {
        return this.publisherId
    }

    getMsgChainId(): string {
        return this.msgChainId
    }

    getWindowNumber(): number {
        return this.windowNumber
    }

    getMessageCount(): number {
        return this.messageCount
    }

    getTotalPayloadSize(): number {
        return this.totalPayloadSize
    }

    getLastUpdate(): number {
        return this.lastUpdate
    }
}

// TODO: naive implementation w.rt. cleaning, when to clean?
export class BucketStatsCollector {
    private readonly bucketsByNode = new Map<NodeId, BucketStats[]>()

    record(nodeId: NodeId, message: StreamMessage): void {
        if (!this.bucketsByNode.has(nodeId)) {
            this.bucketsByNode.set(nodeId, [])
        }
        const buckets = this.bucketsByNode.get(nodeId)!
        let bucket = buckets.find((b) => b.includes(message))
        if (bucket === undefined) { // TODO: do not accept if too old?
            bucket = new BucketStats(message)
            buckets.push(bucket)
        }
        bucket.record(message.getSerializedContent().length)
    }

    getBuckets(nodeId: NodeId): ReadonlyArray<BucketStats> {
        return this.bucketsByNode.get(nodeId) || []
    }

    // TODO: test, performance
    removeBuckets(nodeId: NodeId, bucketsToRemove: ReadonlyArray<BucketStats>): void {
        if (this.bucketsByNode.has(nodeId)) {
            this.bucketsByNode.set(nodeId, this.bucketsByNode.get(nodeId)!.filter((b) => !bucketsToRemove.includes(b)))
        }
    }
}
