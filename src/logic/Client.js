const { EventEmitter } = require('events')
const createDebug = require('debug')

module.exports = class Client extends EventEmitter {
    constructor(id, nodeToNode) {
        super()

        this.id = id
        this.nodeId = null
        this.protocols = {
            nodeToNode
        }

        this.debug = createDebug(`streamr:logic:client:${this.id}`)
        this.debug('node: %s is running', this.id)
    }

    connectToNode(nodeAddress) {
        return this.protocols.nodeToNode.connectToNode(nodeAddress)
            .then((nodeId) => {
                this.nodeId = nodeId
            })
    }

    publish(streamId, data, number, previousNumber) {
        if (this.nodeId) {
            this.debug('publishing data to stream %s', streamId)
            this.protocols.nodeToNode.sendData(this.nodeId, streamId, data, number, previousNumber)
        } else {
            throw new Error('Failed to publish because node not set.')
        }
    }

    subscribe(streamId) {
        if (this.nodeId) {
            this.debug('subscribing to stream %s', streamId)
            this.protocols.nodeToNode.sendSubscribe(this.nodeId, streamId)
        } else {
            throw new Error('Failed to subscribe because node not set.')
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
