const { EventEmitter } = require('events')
const debug = require('debug')('streamr:node-node')

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
}
