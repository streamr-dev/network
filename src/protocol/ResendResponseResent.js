import ResendResponse from './ResendResponse'
import MessageFromServer from './MessageFromServer'

const TYPE = 5

class ResendResponseResent extends ResendResponse {
    constructor(streamId, streamPartition, subId) {
        super(TYPE, streamId, streamPartition, subId)
    }
    static getMessageName() {
        return 'ResendResponseResent'
    }
}

MessageFromServer.registerMessageClass(ResendResponseResent, TYPE)
module.exports = ResendResponseResent
