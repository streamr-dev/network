import ResendResponse from './ResendResponse'
import WebsocketResponse from './WebsocketResponse'

const TYPE = 6

class ResendResponseNoResend extends ResendResponse {
    constructor(streamId, streamPartition, subId) {
        super(TYPE, streamId, streamPartition, subId)
    }
    static getMessageName() {
        return 'ResendResponseNoResend'
    }
}

WebsocketResponse.registerMessageClass(ResendResponseNoResend, TYPE)
module.exports = ResendResponseNoResend
