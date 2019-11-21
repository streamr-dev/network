import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import ControlMessage from '../ControlMessage'

const TYPE = 10

export default class UnsubscribeRequest extends ControlMessage {
    constructor(version, streamId, streamPartition) {
        if (new.target === UnsubscribeRequest) {
            throw new TypeError('UnSubscribeRequest is abstract.')
        }
        super(version, TYPE)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition
    }

    static create(streamId, streamPartition) {
        return new (ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE))(streamId, streamPartition)
    }
}

/* static */
UnsubscribeRequest.TYPE = TYPE
