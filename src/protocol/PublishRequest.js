import WebsocketRequest from './WebsocketRequest'

const TYPE = 'publish'

class PublishRequest extends WebsocketRequest {
    constructor(streamId, apiKey, content, timestamp, partitionKey) {
        super(TYPE, streamId, apiKey)
        this.content = content
        this.timestamp = timestamp
        this.partitionKey = partitionKey
    }

    getSerializedContent() {
        if (typeof this.content === 'string') {
            return this.content
        } else if (typeof this.content === 'object') {
            return JSON.stringify(this.content)
        }
        throw new Error('Stream payloads can only be objects!')
    }

    toObject() {
        return {
            ...super.toObject(),
            msg: this.getSerializedContent(),
            ts: this.timestamp,
            pkey: this.partitionKey,
        }
    }

    static deserialize(stringOrObject) {
        const msg = super.deserialize(stringOrObject)

        if (msg.type !== TYPE) {
            throw new Error(`Invalid PublishRequest: ${JSON.stringify(stringOrObject)}`)
        }

        return new PublishRequest(
            msg.stream,
            msg.authKey,
            msg.msg,
            msg.ts,
            msg.pkey,
        )
    }
}

module.exports = PublishRequest
