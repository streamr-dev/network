export default class MessageID {
    constructor(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId) {
        if (streamId == null) {
            throw new Error('streamId must be defined!')
        }
        if (streamPartition == null) {
            throw new Error('streamPartition must be defined!')
        }
        if (timestamp == null) {
            throw new Error('timestamp must be defined!')
        }
        if (sequenceNumber == null) {
            throw new Error('sequenceNumber must be defined!')
        }
        if (publisherId == null) {
            throw new Error('publisherId must be defined!')
        }
        if (msgChainId == null) {
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
