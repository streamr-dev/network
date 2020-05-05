import { validateIsNotEmptyString } from '../../utils/validations'

import StreamAndPartition from './StreamAndPartition'

export default class ResendResponsePayload extends StreamAndPartition {
    constructor(streamId, streamPartition, requestId) {
        super(streamId, streamPartition)
        validateIsNotEmptyString('requestId', requestId)
        this.requestId = requestId
    }

    toObject() {
        return {
            ...super.toObject(),
            sub: this.requestId,
        }
    }

    static objectToConstructorArgs(msg) {
        return [msg.stream, msg.partition, msg.sub]
    }
}
