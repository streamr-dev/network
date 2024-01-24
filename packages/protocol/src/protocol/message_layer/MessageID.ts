import { validateIsNotNegativeInteger } from '../../utils/validations'

import MessageRef from './MessageRef'
import { StreamID } from '../../../src/utils/StreamID'
import { StreamPartID, toStreamPartID } from '../../utils/StreamPartID'
import { EthereumAddress } from '@streamr/utils'

export default class MessageID {

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
