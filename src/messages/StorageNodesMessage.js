const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class StorageNodesMessage {
    constructor(streamId, nodeAddresses, source = null) {
        if (streamId == null) {
            throw new Error('streamId not given')
        }
        if (nodeAddresses == null) {
            throw new Error('nodeAddresses not given')
        }
        this.version = CURRENT_VERSION
        this.code = msgTypes.STORAGE_NODES
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

    getStreamId() {
        return this.streamId
    }

    getNodeAddresses() {
        return this.nodeAddresses
    }

    getSource() {
        return this.source
    }
}
