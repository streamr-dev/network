const { EventEmitter } = require('events')
const debug = require('debug')('streamr:node-node')
const encoder = require('../helpers/MessageEncoder')

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

    subscribeToStream(streamId, messageHandler, doneHandler) {
        this.connection.node.pubsub.subscribe(streamId, messageHandler, doneHandler) // TODO: leaky abstraction
    }

    publishToStream(streamId, data, cb) {
        this.connection.node.pubsub.publish(streamId, Buffer.from(data), cb)
    }
}
