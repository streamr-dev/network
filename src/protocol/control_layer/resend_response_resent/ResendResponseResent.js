import ControlMessage from '../ControlMessage'

const TYPE = 5

export default class ResendResponseResent extends ControlMessage {
    constructor(version) {
        if (new.target === ResendResponseResent) {
            throw new TypeError('ResendResponseResent is abstract.')
        }
        super(version, TYPE)
    }

    static create(streamId, streamPartition, subId) {
        return new (ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE))(streamId, streamPartition, subId)
    }
}

/* static */
ResendResponseResent.TYPE = TYPE
