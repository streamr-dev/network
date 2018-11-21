const DuplicateMessageDetector = require('./DuplicateMessageDetector')

module.exports = class StreamManager {
    constructor() {
        this.ownStreams = new Map() // streamId => DuplicateMessageDetector
        this.knownStreams = new Map() // streamId => list of nodeAddresses
    }

    markNumbersAndCheckThatIsNotDuplicate(streamId, number, previousNumber) {
        if (!this.isOwnStream(streamId)) {
            throw new Error(`Not own stream ${streamId}`)
        }
        const duplicateDetector = this.ownStreams.get(streamId)
        return duplicateDetector.markAndCheck(previousNumber, number)
    }

    markOwnStream(streamId) {
        if (this.ownStreams.has(streamId)) {
            throw new Error('already marked ' + streamId)
        }
        this.ownStreams.set(streamId, new DuplicateMessageDetector())
    }

    markKnownStream(streamId, nodeAddresses) {
        this.knownStreams.set(streamId, nodeAddresses)
    }

    isOwnStream(streamId) {
        return this.ownStreams.has(streamId)
    }

    getOwnStreams() {
        return [...this.ownStreams.keys()]
    }

    isKnownStream(streamId) {
        return this.knownStreams.has(streamId) && this.knownStreams.get(streamId).length !== 0
    }

    getNodesForKnownStream(streamId) {
        return this.knownStreams.get(streamId) || []
    }
}
