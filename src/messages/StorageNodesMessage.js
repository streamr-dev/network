const { msgTypes } = require('./messageTypes')
const NetworkMessage = require('./NetworkMessage')

module.exports = class StorageNodesMessage extends NetworkMessage {
    constructor(streamId, nodeAddresses, source = null) {
        super(msgTypes.STORAGE_NODES, source)
        if (streamId == null) {
            throw new Error('streamId not given')
        }
        if (nodeAddresses == null) {
            throw new Error('nodeAddresses not given')
        }
        this.streamId = streamId
        this.nodeAddresses = nodeAddresses
    }

    getStreamId() {
        return this.streamId
    }

    getNodeAddresses() {
        return this.nodeAddresses
    }
}
