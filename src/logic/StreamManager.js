const DuplicateMessageDetector = require('./DuplicateMessageDetector')

module.exports = class StreamManager {
    constructor() {
        this.ownStreams = {} // streamId => lastNumber
        this.knownStreams = new Map() // streamId => DuplicateMessageDetector
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

    markNumbersAndCheckThatIsNotDuplicate(streamId, number, previousNumber) {
        if (this.isLeaderOf(streamId)) {
            throw new Error(`Should not be leader of stream ${streamId}`)
        }
        if (!this.knownStreams.has(streamId)) {
            throw new Error(`Unknown stream ${streamId}`)
        }

        const duplicateDetector = this.knownStreams.get(streamId)
        return duplicateDetector.markAndCheck(previousNumber, number)
    }

    markCurrentNodeAsLeaderOf(streamId) {
        this.knownLeaders.delete(streamId)
        this.knownStreams.delete(streamId)
        this.ownStreams[streamId] = null
    }

    markOtherNodeAsLeader(streamId, nodeAddress) {
        delete this.ownStreams[streamId]
        this.knownLeaders.set(streamId, nodeAddress)
        if (!this.knownStreams.has(streamId)) {
            this.knownStreams.set(streamId, new DuplicateMessageDetector())
        }
    }

    markRepeaterNodes(streamId, nodeAddresses) {
        this.knownRepeaters.set(streamId, nodeAddresses)
        if (!this.knownStreams.has(streamId)) {
            this.knownStreams.set(streamId, new DuplicateMessageDetector())
        }
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
