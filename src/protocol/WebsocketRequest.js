class WebsocketRequest {
    constructor(type, streamId, apiKey) {
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
