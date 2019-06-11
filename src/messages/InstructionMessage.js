const { msgTypes } = require('./messageTypes')
const NetworkMessage = require('./NetworkMessage')

module.exports = class InstructionMessage extends NetworkMessage {
    constructor(streamId, nodeAddresses = [], source = null) {
        super(msgTypes.INSTRUCTION, source)
        if (typeof streamId === 'undefined') {
            throw new Error('streamId cant be undefined')
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
