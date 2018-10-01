const BasicMessage = require('./BasicMessage')

module.exports = class StreamMessage extends BasicMessage {
    getStreamId() {
        return this.payload[0]
    }

    setStreamId(streamId) {
        this.payload[0] = streamId
    }

    getNodeAddress() {
        return this.payload[1]
    }

    setNodeAddress(nodeAddress) {
        this.payload[1] = nodeAddress
    }
}
