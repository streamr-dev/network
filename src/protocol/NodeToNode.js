const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:node-node')
const encoder = require('../helpers/MessageEncoder')
const { getAddress } = require('../util')

module.exports = class NodeToNode extends EventEmitter {
    constructor(endpoint) {
        super()
        this.endpoint = endpoint
    }

    connectToNodes(nodes) {
        nodes.forEach((node) => {
            debug('connecting to new node %s', node)
            this.endpoint.connect(node)
        })
    }

    sendData(receiverNode, streamId, data) {
        this.endpoint.send(receiverNode, encoder.dataMessage(streamId, data))
    }

    getAddress() {
        return getAddress(this.endpoint.node.peerInfo)
    }

    stop(cb) {
        this.endpoint.node.stop(() => cb())
    }
}
