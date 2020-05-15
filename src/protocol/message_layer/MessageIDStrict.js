import { validateIsNotNegativeInteger, validateIsString } from '../../utils/validations'

import MessageID from './MessageID'

export default class MessageIDStrict extends MessageID {
    constructor(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId) {
        super(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId)
        validateIsNotNegativeInteger('sequenceNumber', sequenceNumber)
        validateIsString('publisherId', publisherId)
        validateIsString('msgChainId', msgChainId)
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

        return new MessageIDStrict(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId)
    }
}
