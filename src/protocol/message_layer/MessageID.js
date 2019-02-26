class MessageID {
    constructor(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId) {
        if (typeof streamId === 'undefined') {
            throw new Error('streamId must be defined!')
        }
        if (typeof streamPartition === 'undefined') {
            throw new Error('streamPartition must be defined!')
        }
        if (typeof timestamp === 'undefined') {
            throw new Error('timestamp must be defined!')
        }
        if (typeof sequenceNumber === 'undefined') {
            throw new Error('sequenceNumber must be defined!')
        }
        if (typeof publisherId === 'undefined') {
            throw new Error('publisherId must be defined!')
        }
        if (typeof msgChainId === 'undefined') {
            throw new Error('msgChainId must be defined!')
        }
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.timestamp = timestamp
        this.sequenceNumber = sequenceNumber
        this.publisherId = publisherId
        this.msgChainId = msgChainId
    }

    toArray() {
        return [
            this.streamId,
            this.streamPartition,
            this.timestamp,
            this.sequenceNumber,
            this.publisherId,
            this.msgChainId,
        ]
    }

    serialize() {
        return JSON.stringify(this.toArray())
    }
}

module.exports = MessageID
