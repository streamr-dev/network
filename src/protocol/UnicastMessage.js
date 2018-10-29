import MessageFromServer from './MessageFromServer'
import StreamMessage from './StreamMessage'

const TYPE = 1

class UnicastMessage extends MessageFromServer {
    constructor(streamMessage, subId) {
        super(TYPE, streamMessage, subId)
    }
    static getMessageName() {
        return 'UnicastMessage'
    }
    static getPayloadClass() {
        return StreamMessage
    }
}

MessageFromServer.registerMessageClass(UnicastMessage, TYPE)
module.exports = UnicastMessage
