const { StreamID } = require('../identifiers')
const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class ResendLastRequest {
    constructor(streamId, subId, numberLast, source = null) {
        if (!(streamId instanceof StreamID)) {
            throw new Error(`invalid streamId: ${streamId}`)
        }
        if (subId == null) {
            throw new Error('subId not given')
        }
        if (!Number.isInteger(numberLast)) {
            throw new Error('numberLast is not an integer')
        }
        this.version = CURRENT_VERSION
        this.code = msgTypes.RESEND_LAST
        this.source = source
        this.streamId = streamId
        this.subId = subId
        this.numberLast = numberLast
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

    getStreamId() {
        return this.streamId
    }

    getSubId() {
        return this.subId
    }

    getNumberLast() {
        return this.numberLast
    }
}
