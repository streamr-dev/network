import ValidationError from '../../../errors/ValidationError'
import ControlMessage from '../ControlMessage'

const TYPE = 9

export default class SubscribeRequest extends ControlMessage {
    constructor(version, streamId, streamPartition, sessionToken) {
        if (new.target === SubscribeRequest) {
            throw new TypeError('SubscribeRequest is abstract.')
        }
        super(version, TYPE)
        this.streamId = streamId
        if (streamPartition == null) {
            throw new ValidationError('Stream partition not given!')
        }
        this.streamPartition = streamPartition
        this.sessionToken = sessionToken
    }

    static create(streamId, streamPartition, sessionToken) {
        return new (ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE))(streamId, streamPartition, sessionToken)
    }
}

/* static */
SubscribeRequest.TYPE = TYPE
