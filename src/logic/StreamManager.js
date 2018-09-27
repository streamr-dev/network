module.exports = class StreamManager {
    constructor() {
        this.ownStreams = new Set()
        this.knownStreams = new Map() // streamId => nodeAddress
    }

    markCurrentNodeAsLeaderOf(streamId) {
        this.knownStreams.delete(streamId)
        this.ownStreams.add(streamId)
    }

    markOtherNodeAsLeader(streamId, nodeAddress) {
        this.ownStreams.delete(streamId)
        this.knownStreams.set(streamId, nodeAddress)
    }

    getLeaderAddressFor(streamId) {
        return this.knownStreams.get(streamId)
    }

    isLeaderOf(streamId) {
        return this.ownStreams.has(streamId)
    }

    isOtherNodeLeaderOf(streamId) {
        return this.knownStreams.has(streamId)
    }

    getOwnStreams() {
        return [...this.ownStreams]
    }
}
