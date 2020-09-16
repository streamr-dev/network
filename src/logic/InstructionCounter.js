module.exports = class InstructionCounter {
    constructor() {
        this.counters = {} // nodeId => streamKey => integer
    }

    setOrIncrement(nodeId, streamKey) {
        this._getAndSetIfNecessary(nodeId, streamKey)
        this.counters[nodeId][streamKey] += 1
        return this.counters[nodeId][streamKey]
    }

    filterStatus(status, source) {
        const filteredStreams = {}
        Object.entries(status.streams).forEach(([streamKey, entry]) => {
            const currentCounter = this._getAndSetIfNecessary(source, streamKey)
            if (entry.counter >= currentCounter) {
                filteredStreams[streamKey] = entry
            }
        })
        return filteredStreams
    }

    removeNode(nodeId) {
        delete this.counters[nodeId]
    }

    removeStream(streamKey) {
        Object.keys(this.counters).forEach((nodeId) => {
            delete this.counters[nodeId][streamKey]
        })
    }

    _getAndSetIfNecessary(nodeId, streamKey) {
        if (this.counters[nodeId] === undefined) {
            this.counters[nodeId] = {}
        }
        if (this.counters[nodeId][streamKey] === undefined) {
            this.counters[nodeId][streamKey] = 0
        }
        return this.counters[nodeId][streamKey]
    }
}
