import ControlMessage from '../ControlMessage'

const TYPE = 12

export default class ResendFromRequest extends ControlMessage {
    constructor(version) {
        if (new.target === ResendFromRequest) {
            throw new TypeError('ResendFromRequest is abstract.')
        }
        super(version, TYPE)
    }

    static create(streamId, streamPartition, subId, msgRefArgsArray, publisherId, msgChainId, sessionToken) {
        const C = ControlMessage.getClass(ControlMessage.LATEST_VERSION, TYPE)
        return new C(streamId, streamPartition, subId, msgRefArgsArray, publisherId, msgChainId, sessionToken)
    }
}

/* static */ ResendFromRequest.TYPE = TYPE
