import ControlMessage from '../ControlMessage'

const TYPE = 3

export default class UnsubscribeResponse extends ControlMessage {
    constructor(version) {
        if (new.target === UnsubscribeResponse) {
            throw new TypeError('UnsubscribeResponse is abstract.')
        }
        super(version, TYPE)
    }

    static create(streamId, streamPartition) {
        return new (ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE))(streamId, streamPartition)
    }
}

/* static */
UnsubscribeResponse.TYPE = TYPE
