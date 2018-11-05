import ResendResponse from './ResendResponse'
import WebsocketResponse from './WebsocketResponse'

const TYPE = 5

class ResendResponseResent extends ResendResponse {
    constructor(streamId, streamPartition, subId) {
        super(TYPE, streamId, streamPartition, subId)
    }
    static getMessageName() {
        return 'ResendResponseResent'
    }
}

WebsocketResponse.registerMessageClass(ResendResponseResent, TYPE)
module.exports = ResendResponseResent
