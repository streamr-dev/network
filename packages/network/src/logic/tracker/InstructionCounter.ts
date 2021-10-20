import { Status, StreamKey } from '../../identifiers'
import { NodeId } from '../node/Node'

export const COUNTER_UNSUBSCRIBE = -1

type Counters = Record<NodeId,Record<StreamKey,number>>

export class InstructionCounter {
    private readonly counters: Counters = {}

    constructor() {}

    setOrIncrement(nodeId: NodeId, streamKey: StreamKey): number {
        this.getAndSetIfNecessary(nodeId, streamKey)
        this.counters[nodeId][streamKey] += 1
        return this.counters[nodeId][streamKey]
    }

    isMostRecent(status: Status, source: NodeId): boolean {
        const currentCounter = this.getAndSetIfNecessary(source, status.stream.streamKey)
        return (status.stream.counter >= currentCounter || status.stream.counter === COUNTER_UNSUBSCRIBE)
    }

    removeNode(nodeId: NodeId): void {
        delete this.counters[nodeId]
    }

    removeStream(streamKey: StreamKey): void {
        Object.keys(this.counters).forEach((nodeId) => {
            delete this.counters[nodeId][streamKey]
        })
    }

    private getAndSetIfNecessary(nodeId: NodeId, streamKey: StreamKey): number {
        if (this.counters[nodeId] === undefined) {
            this.counters[nodeId] = {}
        }
        if (this.counters[nodeId][streamKey] === undefined) {
            this.counters[nodeId][streamKey] = 0
        }
        return this.counters[nodeId][streamKey]
    }
}
