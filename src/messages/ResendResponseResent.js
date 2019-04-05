const { StreamID } = require('../identifiers')
const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class ResendResponseResent {
    constructor(streamId, subId, source = null) {
        if (!(streamId instanceof StreamID)) {
            throw new Error(`invalid streamId: ${streamId}`)
        }
        if (subId == null) {
            throw new Error('subId not given')
        }
        this.version = CURRENT_VERSION
        this.code = msgTypes.RESEND_RESPONSE_RESENT
        this.source = source
        this.streamId = streamId
        this.subId = subId
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
}
