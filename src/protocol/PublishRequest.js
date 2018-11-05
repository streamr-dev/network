import TimestampUtil from '../utils/TimestampUtil'
import ValidationError from '../errors/ValidationError'
import WebsocketRequest from './WebsocketRequest'

const TYPE = 'publish'

class PublishRequest extends WebsocketRequest {
    constructor(streamId, apiKey, sessionToken, content, timestamp, partitionKey) {
        super(TYPE, streamId, apiKey, sessionToken)

        if (!content) {
            throw new ValidationError('No content given!')
        }
        this.content = content

        if (timestamp) {
            this.timestamp = TimestampUtil.parse(timestamp)
        }

        this.partitionKey = partitionKey
    }

    getTimestampAsNumber() {
        if (this.timestamp) {
            return TimestampUtil.parse(this.timestamp)
        }
        return undefined
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
            ts: this.getTimestampAsNumber(),
            pkey: this.partitionKey,
        }
    }

    static getConstructorArguments(msg) {
        return [
            msg.stream,
            msg.authKey,
            msg.sessionToken,
            msg.msg,
            msg.ts,
            msg.pkey,
        ]
    }
}

WebsocketRequest.registerMessageClass(PublishRequest, TYPE)
module.exports = PublishRequest
