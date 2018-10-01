module.exports = class StreamManager {
    constructor() {
        this.ownStreams = {} // streamId => lastNumber
        this.knownStreams = new Map() // streamId => nodeAddress
    }

    fetchNextNumbers(streamId) {
        if (!this.isLeaderOf(streamId)) {
            throw new Error(`Not leader of stream ${streamId}`)
        }
        const previousNumber = this.ownStreams[streamId]
        this.ownStreams[streamId] += 1
        return {
            previousNumber,
            number: this.ownStreams[streamId]
        }
    }

    markCurrentNodeAsLeaderOf(streamId) {
        this.knownStreams.delete(streamId)
        this.ownStreams[streamId] = null
    }

    markOtherNodeAsLeader(streamId, nodeAddress) {
        delete this.ownStreams[streamId]
        this.knownStreams.set(streamId, nodeAddress)
    }

    getLeaderAddressFor(streamId) {
        return this.knownStreams.get(streamId)
    }

    isLeaderOf(streamId) {
        return Object.prototype.hasOwnProperty.call(this.ownStreams, streamId)
    }

    isOtherNodeLeaderOf(streamId) {
        return this.knownStreams.has(streamId)
    }

    getOwnStreams() {
        return [...Object.keys(this.ownStreams)]
    }
}
