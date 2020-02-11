import ControlMessage from '../ControlMessage'

const TYPE = 5

export default class ResendResponseResent extends ControlMessage {
    constructor(version) {
        if (new.target === ResendResponseResent) {
            throw new TypeError('ResendResponseResent is abstract.')
        }
        super(version, TYPE)
    }

    static create(streamId, streamPartition, requestId) {
        return new (ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE))(streamId, streamPartition, requestId)
    }
}

/* static */
ResendResponseResent.TYPE = TYPE
