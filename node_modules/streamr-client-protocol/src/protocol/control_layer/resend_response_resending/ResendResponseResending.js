import ControlMessage from '../ControlMessage'

const TYPE = 4

export default class ResendResponseResending extends ControlMessage {
    constructor(version) {
        if (new.target === ResendResponseResending) {
            throw new TypeError('ResendResponseResending is abstract.')
        }
        super(version, TYPE)
    }

    static create(streamId, streamPartition, requestId) {
        return new (ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE))(streamId, streamPartition, requestId)
    }
}

/* static */
ResendResponseResending.TYPE = TYPE
