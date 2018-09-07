const EventEmitter = require('events').EventEmitter
const TrackerNode = require('../protocol/TrackerNode')
const NodeToNode = require('../protocol/NodeToNode')
const encoder = require('../helpers/MessageEncoder')
const {
    generateClientId,
    getStreams,
    getAddress
} = require('../util')
const debug = require('debug')('streamr:node')

module.exports = class Node extends EventEmitter {
    constructor(connection) {
        super()

        this.connection = connection
        this.nodeId = generateClientId('publisher')

        this.connection.once('node:ready', () => this.nodeReady())
    }

    nodeReady() {
        debug('node: %s is running\n\n\n', this.nodeId)
    }

    publish(streamdId, data) {
        this.connection.node.pubsub.publish(
            streamdId,
            Buffer.from(data),
            () => {}
        )
    }
}
