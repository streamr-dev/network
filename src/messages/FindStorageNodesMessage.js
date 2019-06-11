const { msgTypes } = require('./messageTypes')
const NetworkMessage = require('./NetworkMessage')

module.exports = class FindStorageNodesMessage extends NetworkMessage {
    constructor(streamId, source = null) {
        super(msgTypes.FIND_STORAGE_NODES, source)
        if (streamId == null) {
            throw new Error('streamId not given')
        }
        this.streamId = streamId
    }

    getStreamId() {
        return this.streamId
    }
}
