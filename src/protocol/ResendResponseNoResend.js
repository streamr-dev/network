import ResendResponseMessage from './ResendResponseMessage'
import MessageFromServer from './MessageFromServer'

const TYPE = 6

class ResendResponseNoResend extends MessageFromServer {
    constructor(streamAndPartition) {
        super(TYPE, streamAndPartition)
    }
    static getMessageName() {
        return 'ResendResponseNoResend'
    }
    static getPayloadClass() {
        return ResendResponseMessage
    }
}

MessageFromServer.registerMessageClass(ResendResponseNoResend, TYPE)
module.exports = ResendResponseNoResend
