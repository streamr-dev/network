import { Status, StatusStreams, StreamKey } from "../identifiers"

interface Counters {
    [key: string]: {
        [key: string]: number
    }
}

export class InstructionCounter {
    private readonly counters: Counters = {}

    constructor() {}

    setOrIncrement(nodeId: string, streamKey: StreamKey): number {
        this.getAndSetIfNecessary(nodeId, streamKey)
        this.counters[nodeId][streamKey] += 1
        return this.counters[nodeId][streamKey]
    }

    filterStatus(status: Status, source: string): StatusStreams {
        const filteredStreams: StatusStreams = {}
        Object.entries(status.streams).forEach(([streamKey, entry]) => {
            const currentCounter = this.getAndSetIfNecessary(source, streamKey)
            if (entry.counter >= currentCounter) {
                filteredStreams[streamKey] = entry
            }
        })
        return filteredStreams
    }

    removeNode(nodeId: string): void {
        delete this.counters[nodeId]
    }

    removeStream(streamKey: StreamKey): void {
        Object.keys(this.counters).forEach((nodeId) => {
            delete this.counters[nodeId][streamKey]
        })
    }

    private getAndSetIfNecessary(nodeId: string, streamKey: StreamKey): number {
        if (this.counters[nodeId] === undefined) {
            this.counters[nodeId] = {}
        }
        if (this.counters[nodeId][streamKey] === undefined) {
            this.counters[nodeId][streamKey] = 0
        }
        return this.counters[nodeId][streamKey]
    }
}
