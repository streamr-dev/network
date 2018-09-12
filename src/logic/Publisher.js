const { EventEmitter } = require('events')
const debug = require('debug')('streamr:publisher')
const NodeToNode = require('../protocol/NodeToNode')
const { generateClientId } = require('../util')

module.exports = class Publisher extends EventEmitter {
    constructor(connection, nodeAddress) {
        super()

        this.publisherId = generateClientId('publisher')
        this.nodeAddress = nodeAddress
        this.protocols = {
            nodeToNode: new NodeToNode(connection)
        }

        connection.once('node:ready', () => this._onNodeReady())
    }

    _onNodeReady() {
        debug('node: %s is running\n\n\n', this.publisherId)
    }

    publishLibP2P(streamId, data) {
        debug('publishing data', streamId, data)
        this.protocols.nodeToNode.publishToStream(streamId, data, () => {})
    }

    publish(streamId, data) {
        if (this.nodeAddress) {
            debug('publishing data', streamId, data)
            this.protocols.nodeToNode.sendData(this.nodeAddress, streamId, data)
        }
        throw new Error('Failed to publish because this.nodeAddress not defined.')
    }
}
