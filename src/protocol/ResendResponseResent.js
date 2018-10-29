import ResendResponseMessage from './ResendResponseMessage'
import MessageFromServer from './MessageFromServer'

const TYPE = 5

class ResendResponseResent extends MessageFromServer {
    constructor(streamAndPartition) {
        super(TYPE, streamAndPartition)
    }
    static getMessageName() {
        return 'ResendResponseResent'
    }
    static getPayloadClass() {
        return ResendResponseMessage
    }
}

MessageFromServer.registerMessageClass(ResendResponseResent, TYPE)
module.exports = ResendResponseResent
