import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../utils/validations'

export default class MessageID {
    constructor(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId) {
        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsNotNegativeInteger('timestamp', timestamp)

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

    static fromArray(arr) {
        const [
            streamId,
            streamPartition,
            timestamp,
            sequenceNumber,
            publisherId,
            msgChainId,
        ] = arr

        return new MessageID(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId)
    }

    serialize() {
        return JSON.stringify(this.toArray())
    }
}
