import ResendResponse from './ResendResponse'
import MessageFromServer from './MessageFromServer'

const TYPE = 6

class ResendResponseNoResend extends ResendResponse {
    constructor(streamId, streamPartition, subId) {
        super(TYPE, streamId, streamPartition, subId)
    }
    static getMessageName() {
        return 'ResendResponseNoResend'
    }
}

MessageFromServer.registerMessageClass(ResendResponseNoResend, TYPE)
module.exports = ResendResponseNoResend
