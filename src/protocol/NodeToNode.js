const { EventEmitter } = require('events')
const debug = require('debug')('streamr:protocol:node-node')
const encoder = require('../helpers/MessageEncoder')
const { getAddress } = require('../util')

module.exports = class NodeToNode extends EventEmitter {
    constructor(connection) {
        super()
        this.connection = connection
    }

    connectToNodes(nodes) {
        nodes.forEach((node) => {
            debug('connecting to new node %s', node)
            this.connection.connect(node)
        })
    }

    sendData(receiverNode, streamId, data) {
        this.connection.send(receiverNode, encoder.dataMessage(streamId, data))
    }

    getAddress() {
        return getAddress(this.connection.node.peerInfo)
    }

    stop(cb) {
        this.connection.node.stop(() => cb())
    }
}
