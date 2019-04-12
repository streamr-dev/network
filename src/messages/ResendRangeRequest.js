const { StreamID, MessageReference } = require('../identifiers')
const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class ResendRangeRequest {
    constructor(streamId, subId, fromMsgRef, toMsgRef, publisherId, source = null) {
        if (!(streamId instanceof StreamID)) {
            throw new Error(`invalid streamId: ${streamId}`)
        }
        if (subId == null) {
            throw new Error('subId not given')
        }
        if (!(fromMsgRef instanceof MessageReference)) {
            throw new Error(`invalid fromMsgRef: ${fromMsgRef}`)
        }
        if (!(toMsgRef instanceof MessageReference)) {
            throw new Error(`invalid toMsgRef: ${toMsgRef}`)
        }

        this.version = CURRENT_VERSION
        this.code = msgTypes.RESEND_RANGE
        this.source = source
        this.streamId = streamId
        this.subId = subId
        this.fromMsgRef = fromMsgRef
        this.toMsgRef = toMsgRef
        this.publisherId = publisherId
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

    getFromMsgRef() {
        return this.fromMsgRef
    }

    getToMsgRef() {
        return this.toMsgRef
    }

    getPublisherId() {
        return this.publisherId
    }
}
