const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class FindStorageNodesMessage {
    constructor(streamId, source = null) {
        if (streamId == null) {
            throw new Error('streamId not given')
        }
        this.version = CURRENT_VERSION
        this.code = msgTypes.FIND_STORAGE_NODES
        this.source = source
        this.streamId = streamId
    }

    getVersion() {
        return this.version
    }

    getCode() {
        return this.code
    }

    getStreamId() {
        return this.streamId
    }

    getSource() {
        return this.source
    }
}
