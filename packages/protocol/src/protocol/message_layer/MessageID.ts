import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../utils/validations'

import MessageRef from './MessageRef'
export type MessageIDArray = [string, number, number, number, string, string]
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

    toArray(): MessageIDArray {
        return [
            this.streamId,
            this.streamPartition,
            this.timestamp,
            this.sequenceNumber,
            this.publisherId,
            this.msgChainId,
        ]
    }

    static fromArray(arr: MessageIDArray): MessageID {
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

    serialize(): string {
        return JSON.stringify(this.toArray())
    }

    toMessageRef(): MessageRef {
        return new MessageRef(this.timestamp, this.sequenceNumber)
    }

    clone(): MessageID {
        return new MessageID(...this.toArray())
    }
}
