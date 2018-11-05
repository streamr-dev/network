import ValidationError from '../errors/ValidationError'

class WebsocketRequest {
    constructor(type, streamId, apiKey, sessionToken) {
        if (!streamId) {
            throw new ValidationError('No stream ID given!')
        }
        if (!type) {
            throw new ValidationError('No message type given!')
        }

        this.type = type
        this.streamId = streamId
        this.apiKey = apiKey
        this.sessionToken = sessionToken
    }

    toObject() {
        return {
            type: this.type,
            stream: this.streamId,
            authKey: this.apiKey,
            sessionToken: this.sessionToken,
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
