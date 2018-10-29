import ResendResponseMessage from './ResendResponseMessage'
import MessageFromServer from './MessageFromServer'

const TYPE = 4

class ResendResponseResending extends MessageFromServer {
    constructor(streamAndPartition) {
        super(TYPE, streamAndPartition)
    }
    static getMessageName() {
        return 'ResendResponseResending'
    }
    static getPayloadClass() {
        return ResendResponseMessage
    }
}

MessageFromServer.registerMessageClass(ResendResponseResending, TYPE)
module.exports = ResendResponseResending
