import MessageFromServer from './MessageFromServer'
import StreamAndPartition from './StreamAndPartition'

const TYPE = 2

class SubscribeResponse extends MessageFromServer {
    constructor(streamAndPartition) {
        super(TYPE, streamAndPartition)
    }
    static getMessageName() {
        return 'SubscribeResponse'
    }
    static getPayloadClass() {
        return StreamAndPartition
    }
}

MessageFromServer.registerMessageClass(SubscribeResponse, TYPE)
module.exports = SubscribeResponse
