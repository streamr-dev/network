module.exports = class NodeToNodeMessage {
    constructor(controlLayerPayload, source) {
        this.controlLayerPayload = controlLayerPayload
        this.source = source
    }

    getControlLayerPayload() {
        return this.controlLayerPayload
    }

    getSource() {
        return this.getSource()
    }
}
