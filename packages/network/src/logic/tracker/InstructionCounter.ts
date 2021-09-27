import { Status, StatusStreams, StreamKey } from '../../identifiers'
import { NodeId } from '../node/Node'

type Counters = Record<NodeId,Record<StreamKey,number>>

export class InstructionCounter {
    private readonly counters: Counters = {}

    constructor() {}

    setOrIncrement(nodeId: NodeId, streamKey: StreamKey): number {
        this.getAndSetIfNecessary(nodeId, streamKey)
        this.counters[nodeId][streamKey] += 1
        return this.counters[nodeId][streamKey]
    }

    filterStatus(status: Status, source: NodeId): StatusStreams {
        const filteredStreams: StatusStreams = {}
        Object.entries(status.streams).forEach(([streamKey, entry]) => {
            const currentCounter = this.getAndSetIfNecessary(source, streamKey)
            if (entry.counter >= currentCounter || entry.counter === -1) {
                filteredStreams[streamKey] = entry
            }
        })
        return filteredStreams
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
