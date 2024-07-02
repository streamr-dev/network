import { StreamID, StreamPartID, toStreamPartID } from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { MessageRef } from './MessageRef'
import { validateIsNotNegativeInteger } from './validations'

export class MessageID {

    readonly streamId: StreamID
    readonly streamPartition: number
    readonly timestamp: number
    readonly sequenceNumber: number
    readonly publisherId: EthereumAddress
    readonly msgChainId: string

    constructor(
        streamId: StreamID,
        streamPartition: number,
        timestamp: number,
        sequenceNumber: number,
        publisherId: EthereumAddress,
        msgChainId: string
    ) {
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsNotNegativeInteger('timestamp', timestamp)
        validateIsNotNegativeInteger('sequenceNumber', sequenceNumber)
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.timestamp = timestamp
        this.sequenceNumber = sequenceNumber
        this.publisherId = publisherId
        this.msgChainId = msgChainId
    }

    getStreamPartID(): StreamPartID {
        return toStreamPartID(this.streamId, this.streamPartition)
    }

    toMessageRef(): MessageRef {
        return new MessageRef(this.timestamp, this.sequenceNumber)
    }
}
