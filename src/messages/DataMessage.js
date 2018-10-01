const BasicMessage = require('./BasicMessage')

module.exports = class DataMessage extends BasicMessage {
    getStreamId() {
        return this.payload[0]
    }

    setStreamId(streamId) {
        this.payload[0] = streamId
    }

    getPayload() {
        return this.payload[1]
    }

    setPayload(payload) {
        this.payload[1] = payload
    }
}
