const { EventEmitter } = require('events')
const debug = require('debug')('streamr:logic:publisher')
const NodeToNode = require('../protocol/NodeToNode')
const { generateClientId } = require('../util')

module.exports = class Publisher extends EventEmitter {
    constructor(nodeToNode, nodeAddress) {
        super()

        this.id = generateClientId('publisher')
        this.nodeAddress = nodeAddress
        this.protocols = {
            nodeToNode
        }

        debug('node: %s is running\n\n\n', this.id)
    }

    publish(streamId, data) {
        if (this.nodeAddress) {
            debug('publishing data', streamId, data)
            this.protocols.nodeToNode.sendData(this.nodeAddress, streamId, data)
        } else {
            throw new Error('Failed to publish because this.nodeAddress not defined.')
        }
    }

    stop(cb) {
        this.protocols.nodeToNode.stop(cb)
    }

    getAddress() {
        return this.protocols.nodeToNode.getAddress()
    }
}
