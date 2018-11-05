import ValidationError from '../errors/ValidationError'
import WebsocketRequest from './WebsocketRequest'

const TYPE = 'unsubscribe'

class UnsubscribeRequest extends WebsocketRequest {
    constructor(streamId, streamPartition = 0) {
        super(TYPE, streamId)

        if (streamPartition == null) {
            throw new ValidationError('Stream partition not given!')
        }

        this.streamPartition = streamPartition
    }

    toObject() {
        return {
            ...super.toObject(),
            partition: this.streamPartition,
        }
    }

    static getConstructorArguments(msg) {
        return [msg.stream, msg.partition]
    }
}
WebsocketRequest.registerMessageClass(UnsubscribeRequest, TYPE)
module.exports = UnsubscribeRequest
