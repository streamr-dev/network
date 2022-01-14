import { validateIsNotNegativeInteger, validateIsString } from '../../utils/validations'

import MessageID, { MessageIDArray } from './MessageID'
import { StreamID, toStreamID } from '../../../src/utils/StreamID'

export default class MessageIDStrict extends MessageID {
    constructor(streamId: StreamID, streamPartition: number, timestamp: number, sequenceNumber: number, publisherId: string, msgChainId: string) {
        super(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId)
        validateIsNotNegativeInteger('sequenceNumber', sequenceNumber)
        validateIsString('publisherId', publisherId)
        validateIsString('msgChainId', msgChainId)
    }

    static fromArray(arr: MessageIDArray): MessageIDStrict {
        const [
            streamId,
            streamPartition,
            timestamp,
            sequenceNumber,
            publisherId,
            msgChainId,
        ] = arr

        return new MessageIDStrict(toStreamID(streamId), streamPartition, timestamp, sequenceNumber, publisherId, msgChainId)
    }

    clone(): MessageIDStrict {
        return new MessageIDStrict(...this.toArray() as [StreamID, number, number, number, string, string])
    }
}
