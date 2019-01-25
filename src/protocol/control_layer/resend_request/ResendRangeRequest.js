import ControlMessage from '../ControlMessage'

const TYPE = 13

export default class ResendRangeRequest extends ControlMessage {
    constructor(version) {
        if (new.target === ResendRangeRequest) {
            throw new TypeError('ResendRangeRequest is abstract.')
        }
        super(version, TYPE)
    }

    static create(streamId, streamPartition, subId, fromMsgRefArgsArray, toMsgRefArgsArray, publisherId, sessionToken) {
        return new (ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE))(
            streamId, streamPartition, subId, fromMsgRefArgsArray,
            toMsgRefArgsArray, publisherId, sessionToken,
        )
    }
}

/* static */ ResendRangeRequest.TYPE = TYPE
