import ControlMessage from '../ControlMessage'

const TYPE = 11

export default class ResendLastRequest extends ControlMessage {
    constructor(version) {
        if (new.target === ResendLastRequest) {
            throw new TypeError('ResendLastRequest is abstract.')
        }
        super(version, TYPE)
    }

    static create(streamId, streamPartition, subId, numberLast, sessionToken) {
        return new (ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE))(streamId, streamPartition, subId, numberLast, sessionToken)
    }
}

/* static */
ResendLastRequest.TYPE = TYPE
