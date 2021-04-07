import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../utils/validations'

import MessageRef from './MessageRef'

export default class MessageID {

    streamId: string
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    publisherId: string
    msgChainId: string

    constructor(streamId: string, streamPartition: number, timestamp: number, sequenceNumber: number, publisherId: string, msgChainId: string) {
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

    static fromArray(arr: any[]) {
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

    toMessageRef() {
        return new MessageRef(this.timestamp, this.sequenceNumber)
    }
}
