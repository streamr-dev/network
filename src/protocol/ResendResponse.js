import ResendResponsePayload from './ResendResponsePayload'
import WebsocketResponse from './WebsocketResponse'

export default class ResendResponse extends WebsocketResponse {
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
