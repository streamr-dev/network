import WebsocketResponse from './WebsocketResponse'
import StreamMessage from './StreamMessage'

const TYPE = 0

class BroadcastMessage extends WebsocketResponse {
    constructor(streamMessage) {
        super(TYPE, streamMessage)
    }
    static getMessageName() {
        return 'BroadcastMessage'
    }
    static getPayloadClass() {
        return StreamMessage
    }
    static getConstructorArguments(message, payload) {
        return [payload]
    }
}

WebsocketResponse.registerMessageClass(BroadcastMessage, TYPE)
module.exports = BroadcastMessage
