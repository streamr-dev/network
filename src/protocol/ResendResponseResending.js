import ResendResponse from './ResendResponse'
import WebsocketResponse from './WebsocketResponse'

const TYPE = 4

class ResendResponseResending extends ResendResponse {
    constructor(streamId, streamPartition, subId) {
        super(TYPE, streamId, streamPartition, subId)
    }
    static getMessageName() {
        return 'ResendResponseResending'
    }
}

WebsocketResponse.registerMessageClass(ResendResponseResending, TYPE)
module.exports = ResendResponseResending
