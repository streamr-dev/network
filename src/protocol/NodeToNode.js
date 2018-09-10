const EventEmitter = require('events').EventEmitter
const debug = require('debug')('streamr:node-node')

module.exports = class NodeToNode extends EventEmitter {
    constructor(connection) {
        super()

        this.connection = connection

        this.on('streamr:node-node:connect', (peers) => this.onConnectNodes(peers))
    }

    onConnectNodes(peers) {
        peers.forEach((peer) => {
            debug('connecting to new node %s', peer)
            this.connection.connect(peer)
        })
    }
}
