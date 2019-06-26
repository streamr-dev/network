const { msgTypes } = require('./messageTypes')
const NetworkMessage = require('./NetworkMessage')

module.exports = class WrapperMessage extends NetworkMessage {
    constructor(controlLayerPayload, source) {
        super(msgTypes.WRAPPER, source)
        this.controlLayerPayload = controlLayerPayload
    }
}
