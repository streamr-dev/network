const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class StreamMessage {
    constructor(streamId, nodeAddresses = [], source = null) {
        if (typeof streamId === 'undefined') {
            throw new Error('streamId cant be undefined')
        }
        this.version = CURRENT_VERSION
        this.code = msgTypes.STREAM
        this.source = source

        this.streamId = streamId
        this.nodeAddresses = nodeAddresses
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

    getNodeAddresses() {
        return this.nodeAddresses
    }

    setNodeAddresses(nodeAddresses) {
        this.nodeAddresses = nodeAddresses
        return this
    }

    toJSON() {
        return {
            version: this.getVersion(),
            code: this.getCode(),
            source: this.getSource(),
            streamId: this.getStreamId(),
            nodeAddresses: this.getNodeAddresses()
        }
    }
}
