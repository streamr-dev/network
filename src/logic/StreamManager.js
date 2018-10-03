module.exports = class StreamManager {
    constructor() {
        this.ownStreams = {} // streamId => lastNumber
        this.knownLeaders = new Map() // streamId => leaderAddress
        this.knownRepeaters = new Map() // streamId => list of nodeAddresses
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
        this.knownLeaders.delete(streamId)
        this.ownStreams[streamId] = null
    }

    markOtherNodeAsLeader(streamId, nodeAddress) {
        delete this.ownStreams[streamId]
        this.knownLeaders.set(streamId, nodeAddress)
    }

    markRepeaterNodes(streamId, nodeAddresses) {
        this.knownRepeaters.set(streamId, nodeAddresses)
    }

    getLeaderAddressFor(streamId) {
        return this.knownLeaders.get(streamId)
    }

    getRepeatersFor(streamId) {
        return this.knownRepeaters.get(streamId) || []
    }

    isLeaderOf(streamId) {
        return Object.prototype.hasOwnProperty.call(this.ownStreams, streamId)
    }

    isOtherNodeLeaderOf(streamId) {
        return this.knownLeaders.has(streamId)
    }

    isAnyRepeaterKnownFor(streamId) {
        return this.knownRepeaters.has(streamId) && this.knownRepeaters.get(streamId).length !== 0
    }

    getOwnStreams() {
        return [...Object.keys(this.ownStreams)]
    }
}
