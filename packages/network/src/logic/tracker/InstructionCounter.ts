import { StreamPartID, toStreamPartID } from 'streamr-client-protocol'
import { Status } from '../../identifiers'
import { NodeId } from '../node/Node'

export const COUNTER_UNSUBSCRIBE = -1
// Used by the tracker to signal to nodes that they are alone in the topology
export const COUNTER_LONE_NODE = -2

type Counters = Record<NodeId, Record<StreamPartID, number>>

export class InstructionCounter {
    private readonly counters: Counters = {}

    constructor() {}

    setOrIncrement(nodeId: NodeId, streamPartId: StreamPartID): number {
        this.getAndSetIfNecessary(nodeId, streamPartId)
        this.counters[nodeId][streamPartId] += 1
        return this.counters[nodeId][streamPartId]
    }

    isMostRecent(status: Status, source: NodeId): boolean {
        const streamPartId = toStreamPartID(status.streamPart.id, status.streamPart.partition)
        const currentCounter = this.getAndSetIfNecessary(source, streamPartId)
        return (status.streamPart.counter >= currentCounter || status.streamPart.counter === COUNTER_UNSUBSCRIBE)
    }

    removeNodeFromStreamPart(nodeId: NodeId, streamPartId: StreamPartID): void {
        if (this.counters[nodeId] !== undefined) {
            delete this.counters[nodeId][streamPartId]
            if (Object.keys(this.counters[nodeId]).length === 0) {
                delete this.counters[nodeId]
            }
        }
    }

    removeStreamPart(streamPartId: StreamPartID): void {
        Object.keys(this.counters).forEach((nodeId) => {
            delete this.counters[nodeId][streamPartId]
        })
    }

    private getAndSetIfNecessary(nodeId: NodeId, streamPartId: StreamPartID): number {
        if (this.counters[nodeId] === undefined) {
            this.counters[nodeId] = {}
        }
        if (this.counters[nodeId][streamPartId] === undefined) {
            this.counters[nodeId][streamPartId] = 0
        }
        return this.counters[nodeId][streamPartId]
    }
}
