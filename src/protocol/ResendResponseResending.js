import ResendResponse from './ResendResponse'
import MessageFromServer from './MessageFromServer'

const TYPE = 4

class ResendResponseResending extends ResendResponse {
    constructor(streamId, streamPartition, subId) {
        super(TYPE, streamId, streamPartition, subId)
    }
    static getMessageName() {
        return 'ResendResponseResending'
    }
}

MessageFromServer.registerMessageClass(ResendResponseResending, TYPE)
module.exports = ResendResponseResending
