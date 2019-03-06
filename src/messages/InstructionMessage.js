const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class InstructionMessage {
    constructor(streamId, nodeAddresses = [], source = null) {
        if (typeof streamId === 'undefined') {
            throw new Error('streamId cant be undefined')
        }
        this.version = CURRENT_VERSION
        this.code = msgTypes.INSTRUCTION
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

    getStreamId() {
        return this.streamId
    }

    getNodeAddresses() {
        return this.nodeAddresses
    }
}
