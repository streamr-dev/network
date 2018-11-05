import ResendResponsePayload from './ResendResponsePayload'
import MessageFromServer from './MessageFromServer'

export default class ResendResponse extends MessageFromServer {
    constructor(TYPE, streamId, streamPartition, subId) {
        super(TYPE, new ResendResponsePayload(streamId, streamPartition, subId))
    }
    static getPayloadClass() {
        return ResendResponsePayload
    }
    // Subclasses must have a constructor of this form
    static getConstructorArguments(serializedMessage, payload) {
        return [payload.streamId, payload.streamPartition, payload.subId]
    }
}
