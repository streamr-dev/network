import MessageFromServer from './MessageFromServer'
import StreamAndPartition from './StreamAndPartition'

const TYPE = 2

class SubscribeResponse extends MessageFromServer {
    constructor(streamId, streamPartition) {
        super(TYPE, new StreamAndPartition(streamId, streamPartition))
    }
    static getMessageName() {
        return 'SubscribeResponse'
    }
    static getPayloadClass() {
        return StreamAndPartition
    }
    static getConstructorArguments(message, payload) {
        return [payload.streamId, payload.streamPartition]
    }
}

MessageFromServer.registerMessageClass(SubscribeResponse, TYPE)
module.exports = SubscribeResponse
