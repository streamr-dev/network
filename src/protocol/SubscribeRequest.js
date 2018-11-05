import ValidationError from '../errors/ValidationError'
import WebsocketRequest from './WebsocketRequest'

const TYPE = 'subscribe'

class SubscribeRequest extends WebsocketRequest {
    constructor(streamId, streamPartition = 0, apiKey, sessionToken) {
        super(TYPE, streamId, apiKey, sessionToken)

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
        return [msg.stream, msg.partition, msg.authKey, msg.sessionToken]
    }
}

WebsocketRequest.registerMessageClass(SubscribeRequest, TYPE)
module.exports = SubscribeRequest
