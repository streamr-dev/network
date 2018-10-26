import WebsocketRequest from './WebsocketRequest'

const TYPE = 'unsubscribe'

class UnsubscribeRequest extends WebsocketRequest {
    constructor(streamId, streamPartition = 0) {
        super(TYPE, streamId)
        this.streamPartition = streamPartition
    }

    toObject() {
        return {
            ...super.toObject(),
            partition: this.streamPartition,
        }
    }
}

UnsubscribeRequest.deserialize = (stringOrObject) => {
    const msg = (typeof stringOrObject === 'string' ? JSON.parse(stringOrObject) : stringOrObject)

    if (msg.type !== TYPE) {
        throw new Error(`Invalid UnsubscribeRequest: ${JSON.stringify(stringOrObject)}`)
    }

    return new UnsubscribeRequest(
        msg.stream,
        msg.partition,
    )
}

module.exports = UnsubscribeRequest
