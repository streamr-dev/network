import { StreamMessage } from 'streamr-client-protocol'
import { NodeId } from '../../composition'
import { BucketStats } from './BucketStats'

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
