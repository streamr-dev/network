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

    subscribeToStream(streamId, messageHandler, doneHandler) {
        this.endpoint.node.pubsub.subscribe(streamId, messageHandler, doneHandler) // TODO: leaky abstraction
    }

    publishToStream(streamId, data, cb) {
        this.endpoint.node.pubsub.publish(streamId, Buffer.from(data), cb)
    }

    getAddress() {
        return getAddress(this.endpoint.node.peerInfo)
    }

    stop(cb) {
        this.endpoint.node.stop(() => cb())
    }
}
