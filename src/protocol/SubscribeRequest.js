import ValidationError from '../errors/ValidationError'
import WebsocketRequest from './WebsocketRequest'

const TYPE = 'subscribe'

class SubscribeRequest extends WebsocketRequest {
    constructor(streamId, streamPartition = 0, apiKey) {
        super(TYPE, streamId, apiKey)

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
}

SubscribeRequest.deserialize = (stringOrObject) => {
    const msg = (typeof stringOrObject === 'string' ? JSON.parse(stringOrObject) : stringOrObject)

    if (msg.type !== TYPE) {
        throw new Error(`Invalid SubscribeRequest: ${JSON.stringify(stringOrObject)}`)
    }

    return new SubscribeRequest(
        msg.stream,
        msg.partition,
        msg.authKey,
    )
}

module.exports = SubscribeRequest
