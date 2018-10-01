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

    getNumber() {
        return this.payload[2]
    }

    setNumber(number) {
        this.payload[2] = number
    }

    getPreviousNumber() {
        return this.payload[3]
    }

    setPreviousNumber(previousNumber) {
        this.payload[3] = previousNumber
    }
}
