import WebsocketRequest from './WebsocketRequest'

const TYPE = 'subscribe'

class SubscribeRequest extends WebsocketRequest {
    constructor(streamId, streamPartition, apiKey) {
        super(TYPE, streamId, apiKey)
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
