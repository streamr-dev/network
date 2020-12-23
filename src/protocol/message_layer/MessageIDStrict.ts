import { validateIsNotNegativeInteger, validateIsString } from '../../utils/validations'

import MessageID from './MessageID'

export default class MessageIDStrict extends MessageID {
    constructor(streamId: string, streamPartition: number, timestamp: number, sequenceNumber: number, publisherId: string, msgChainId: string) {
        super(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId)
        validateIsNotNegativeInteger('sequenceNumber', sequenceNumber)
        validateIsString('publisherId', publisherId)
        validateIsString('msgChainId', msgChainId)
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

        return new MessageIDStrict(streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId)
    }
}
