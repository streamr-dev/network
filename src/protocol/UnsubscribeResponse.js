import StreamAndPartition from './StreamAndPartition'
import WebsocketResponse from './WebsocketResponse'

const TYPE = 3

class UnsubscribeResponse extends WebsocketResponse {
    constructor(streamId, streamPartition) {
        super(TYPE, new StreamAndPartition(streamId, streamPartition))
    }
    static getMessageName() {
        return 'UnsubscribeResponse'
    }
    static getPayloadClass() {
        return StreamAndPartition
    }
    static getConstructorArguments(message, payload) {
        return [payload.streamId, payload.streamPartition]
    }
}

WebsocketResponse.registerMessageClass(UnsubscribeResponse, TYPE)
module.exports = UnsubscribeResponse
