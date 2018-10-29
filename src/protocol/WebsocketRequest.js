import ValidationError from '../errors/ValidationError'

class WebsocketRequest {
    constructor(type, streamId, apiKey) {
        if (!streamId) {
            throw new ValidationError('No stream ID given!')
        }
        if (!type) {
            throw new ValidationError('No message type given!')
        }

        this.type = type
        this.streamId = streamId
        this.apiKey = apiKey
    }

    toObject() {
        return {
            type: this.type,
            stream: this.streamId,
            authKey: this.apiKey,
        }
    }

    serialize() {
        return JSON.stringify(this.toObject())
    }

    static deserialize(stringOrObject) {
        return (typeof stringOrObject === 'string' ? JSON.parse(stringOrObject) : stringOrObject)
    }
}

module.exports = WebsocketRequest
