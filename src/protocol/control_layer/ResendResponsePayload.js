import { validateIsNotEmptyString } from '../../utils/validations'
import StreamAndPartition from './StreamAndPartition'

export default class ResendResponsePayload extends StreamAndPartition {
    constructor(streamId, streamPartition, subId) {
        super(streamId, streamPartition)
        validateIsNotEmptyString('subId', subId)
        this.subId = subId
    }

    toObject() {
        return {
            ...super.toObject(),
            sub: this.subId,
        }
    }

    static objectToConstructorArgs(msg) {
        return [msg.stream, msg.partition, msg.sub]
    }
}
