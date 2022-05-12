import { StreamMessage } from 'streamr-client-protocol'
import { NodeId } from '../../composition'
import { Bucket } from './Bucket'

// TODO: naive implementation w.rt. cleaning, when to clean?
export class BucketCollector {
    private readonly bucketsByNode = new Map<NodeId, Bucket[]>()
    private readonly onCreateOrUpdate?: (bucket: Bucket) => void

    constructor(onCreateOrUpdate?: (bucket: Bucket) => void) {
        this.onCreateOrUpdate = onCreateOrUpdate
    }

    record(nodeId: NodeId, message: StreamMessage): void {
        if (!this.bucketsByNode.has(nodeId)) {
            this.bucketsByNode.set(nodeId, [])
        }
        const buckets = this.bucketsByNode.get(nodeId)!
        let bucket = buckets.find((b) => b.includes(message))
        if (bucket === undefined) { // TODO: do not accept if too old?
            bucket = new Bucket(message, nodeId)
            buckets.push(bucket)
        }
        bucket.record(message.getSerializedContent().length)
        this.onCreateOrUpdate?.(bucket)
    }

    getBuckets(nodeId: NodeId): ReadonlyArray<Bucket> {
        return this.bucketsByNode.get(nodeId) || []
    }

    // TODO: test, performance
    removeBucket(bucket: Bucket): void {
        const nodeId = bucket.getNodeId()
        if (this.bucketsByNode.has(nodeId)) {
            this.bucketsByNode.set(nodeId, this.bucketsByNode.get(nodeId)!.filter((b) => b !== bucket))
        }
    }
}
