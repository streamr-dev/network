import StreamAndPartition from './StreamAndPartition'
import MessageFromServer from './MessageFromServer'

const TYPE = 3

class UnsubscribeResponse extends MessageFromServer {
    constructor(streamId, streamPartition) {
        super(TYPE, new StreamAndPartition(streamId, streamPartition))
    }
    static getMessageName() {
        return 'UnsubscribeResponse'
    }
    static getPayloadClass() {
        return StreamAndPartition
    }
    static getConstructorArguments(message, payload) {
        return [payload.streamId, payload.streamPartition]
    }
}

MessageFromServer.registerMessageClass(UnsubscribeResponse, TYPE)
module.exports = UnsubscribeResponse
