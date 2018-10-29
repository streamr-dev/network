import StreamAndPartition from './StreamAndPartition'
import MessageFromServer from './MessageFromServer'

const TYPE = 3

class UnsubscribeResponse extends MessageFromServer {
    constructor(streamAndPartition) {
        super(3, streamAndPartition)
    }
    static getMessageName() {
        return 'UnsubscribeResponse'
    }
    static getPayloadClass() {
        return StreamAndPartition
    }
}

MessageFromServer.registerMessageClass(UnsubscribeResponse, TYPE)
module.exports = UnsubscribeResponse
