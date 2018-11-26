const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class SubscribeMessage {
    constructor(streamId, leechOnly, source = null) {
        if (typeof streamId === 'undefined') {
            throw new Error('streamId cant be undefined')
        }
        if (streamId == null) {
            throw new Error('streamId not given')
        }
        if (leechOnly == null) {
            throw new Error('leechOnly not given')
        }

        this.version = CURRENT_VERSION
        this.code = msgTypes.SUBSCRIBE
        this.source = source

        this.streamId = streamId
        this.leechOnly = leechOnly
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

    getLeechOnly() {
        return this.leechOnly
    }

    toJSON() {
        return {
            version: this.getVersion(),
            code: this.getCode(),
            source: this.getSource(),
            streamId: this.getStreamId(),
            leechOnly: this.getLeechOnly()
        }
    }
}
