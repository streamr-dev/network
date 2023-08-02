import ConsistentHash from 'consistent-hash'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'

/**
 * Slight variations at the very end of a string will not result in the keys
 * being sufficiently assigned around. By having the partition number first,
 * we properly randomize the assignments of stream parts of a stream.
 */
function formKey(streamPartId: StreamPartID): string {
    const [streamId, partition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
    return `${partition}#${streamId}`
}

/**
 * A wrapper for "consistent-hash" library that provides us with additional guarantees such as
 *
 * (1) node insertion order doesn't affect result
 *
 * (2) minor variations in resource suffixes are properly assigned around
 *
 * See the corresponding test, ConstHash.test.ts, for details.
 */
export class ConstHash {
    private readonly nodes = new Array<string>()
    private consistentHash?: ConsistentHash
    private readonly replicationFactor: number

    constructor(replicationFactor: number) {
        this.replicationFactor = replicationFactor
    }

    add(nodeId: string): void {
        if (!this.nodes.includes(nodeId)) {
            this.nodes.push(nodeId)
            this.consistentHash = undefined
        }
    }

    remove(nodeId: string): void {
        const idx = this.nodes.indexOf(nodeId)
        if (idx !== -1) {
            this.nodes.splice(idx, 1)
            this.consistentHash = undefined
        }
    }

    get(streamPartId: StreamPartID): string[] {
        if (this.consistentHash === undefined) {
            this.consistentHash = new ConsistentHash({
                distribution: 'uniform'
            })
            this.nodes.sort()
            for (const nodeId of this.nodes) {
                this.consistentHash.add(nodeId)
            }
        }
        const result = this.consistentHash.get(formKey(streamPartId), this.replicationFactor)
        return this.replicationFactor > 1 ? result : [result] as any
    }
}
