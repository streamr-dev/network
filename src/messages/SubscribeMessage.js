const BasicMessage = require('./BasicMessage')

module.exports = class StreamMessage extends BasicMessage {
    getStreamId() {
        return this.payload
    }

    setStreamId(streamId) {
        this.payload = streamId
    }

    getSender() {
        return this.getSource()
    }

    setSender(sender) {
        this.setSource(sender)
    }
}
