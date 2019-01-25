class MessageRef {
    constructor(timestamp, sequenceNumber) {
        this.timestamp = timestamp
        this.sequenceNumber = sequenceNumber
    }

    toArray() {
        return [
            this.timestamp,
            this.sequenceNumber,
        ]
    }

    serialize() {
        return JSON.stringify(this.toArray())
    }
}

module.exports = MessageRef
