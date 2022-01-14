import { StreamPartID, toStreamPartID } from 'streamr-client-protocol'
import { Status } from '../../identifiers'
import { NodeId } from '../node/Node'

export const COUNTER_UNSUBSCRIBE = -1

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
        const streamPartId = toStreamPartID(status.stream.id, status.stream.partition)
        const currentCounter = this.getAndSetIfNecessary(source, streamPartId)
        return (status.stream.counter >= currentCounter || status.stream.counter === COUNTER_UNSUBSCRIBE)
    }

    removeNode(nodeId: NodeId): void {
        delete this.counters[nodeId]
    }

    removeStream(streamPartId: StreamPartID): void {
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
