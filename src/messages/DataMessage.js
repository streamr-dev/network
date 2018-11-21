const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class DataMessage {
    constructor(streamId, data, number, previousNumber, source = null) {
        if (typeof streamId === 'undefined') {
            throw new Error('streamId cant be undefined')
        }
        if (typeof data === 'undefined') {
            throw new Error('data cant be undefined')
        }
        if (typeof number === 'undefined') {
            throw new Error('number cant be undefined')
        }
        if (typeof previousNumber === 'undefined') {
            throw new Error('previousNumber cant be undefined')
        }

        this.version = CURRENT_VERSION
        this.code = msgTypes.DATA
        this.source = source

        this.streamId = streamId
        this.data = data
        this.number = number
        this.previousNumber = previousNumber
    }

    getVersion() {
        return this.version
    }

    getCode() {
        return this.code
    }

    getSource() {
        return this.source
    }

    setSource(source) {
        this.source = source
        return this
    }

    getStreamId() {
        return this.streamId
    }

    setStreamId(streamId) {
        this.streamId = streamId
        return this
    }

    getData() {
        return this.data
    }

    setData(data) {
        this.data = data
    }

    getNumber() {
        return this.number
    }

    setNumber(number) {
        this.number = number
    }

    getPreviousNumber() {
        return this.previousNumber
    }

    setPreviousNumber(previousNumber) {
        this.previousNumber = previousNumber
    }

    toJSON() {
        return {
            version: this.getVersion(),
            code: this.getCode(),
            source: this.getSource(),
            streamId: this.getStreamId(),
            data: this.getData(),
            number: this.getNumber(),
            previousNumber: this.getPreviousNumber()
        }
    }
}

