const { EventEmitter } = require('events')
const uuidv4 = require('uuid/v4')
const createDebug = require('debug')
const { getIdShort } = require('../util')

module.exports = class Client extends EventEmitter {
    constructor(id, nodeToNode, nodeAddress) {
        super()

        this.id = id || uuidv4()
        this.nodeAddress = nodeAddress
        this.protocols = {
            nodeToNode
        }

        this.debug = createDebug(`streamr:logic:client:${this.id}`)
        this.debug('node: %s is running', this.id)

        if (this.nodeAddress) {
            this.protocols.nodeToNode.endpoint.connect(this.nodeAddress)
        }
    }

    publish(streamId, data) {
        if (this.nodeAddress) {
            this.debug('publishing data to stream %s', streamId)
            this.protocols.nodeToNode.sendData(this.nodeAddress, streamId, data)
        } else {
            throw new Error('Failed to publish because this.nodeAddress not defined.')
        }
    }

    subscribe(streamId) {
        if (this.nodeAddress) {
            this.debug('subscribing to stream %s', streamId)
            this.protocols.nodeToNode.sendSubscribe(this.nodeAddress, streamId)
        } else {
            throw new Error('Failed to subscribe because this.nodeAddress not defined.')
        }
    }

    stop(cb) {
        this.debug('stopping client')
        this.protocols.nodeToNode.stop(cb)
    }

    getAddress() {
        return this.protocols.nodeToNode.getAddress()
    }
}
