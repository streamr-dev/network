import { validateIsString, validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../utils/validations'

export default class MessageID {
    constructor(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId) {
        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsNotNegativeInteger('timestamp', timestamp)
        validateIsNotNegativeInteger('sequenceNumber', sequenceNumber)
        validateIsString('publisherId', publisherId)
        validateIsString('msgChainId', msgChainId)

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
