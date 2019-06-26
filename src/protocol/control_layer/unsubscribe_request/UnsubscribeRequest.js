import ValidationError from '../../../errors/ValidationError'
import ControlMessage from '../ControlMessage'

const TYPE = 10

export default class UnsubscribeRequest extends ControlMessage {
    constructor(version, streamId, streamPartition) {
        if (new.target === UnsubscribeRequest) {
            throw new TypeError('UnSubscribeRequest is abstract.')
        }
        super(version, TYPE)
        this.streamId = streamId
        if (streamPartition == null) {
            throw new ValidationError('Stream partition not given!')
        }
        this.streamPartition = streamPartition
    }

    static create(streamId, streamPartition) {
        return new (ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE))(streamId, streamPartition)
    }
}

/* static */
UnsubscribeRequest.TYPE = TYPE
