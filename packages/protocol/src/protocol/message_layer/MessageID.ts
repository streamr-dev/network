import { validateIsNotEmptyString, validateIsNotNegativeInteger, validateIsString } from '../../utils/validations'

import MessageRef from './MessageRef'
import { StreamID } from '../../../src/utils/StreamID'
import { StreamPartID, toStreamPartID } from '../../utils/StreamPartID'
import { EthereumAddress } from '@streamr/utils'

export default class MessageID {

    streamId: StreamID
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    publisherId: EthereumAddress
    msgChainId: string

    constructor(
        streamId: StreamID,
        streamPartition: number,
        timestamp: number,
        sequenceNumber: number,
        publisherId: EthereumAddress,
        msgChainId: string
    ) {
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

    getStreamPartID(): StreamPartID {
        return toStreamPartID(this.streamId, this.streamPartition)
    }

    toMessageRef(): MessageRef {
        return new MessageRef(this.timestamp, this.sequenceNumber)
    }

    clone(): MessageID {
        return new MessageID(
            this.streamId,
            this.streamPartition,
            this.timestamp,
            this.sequenceNumber,
            this.publisherId,
            this.msgChainId
        )
    }
}
