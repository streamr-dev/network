const { EventEmitter } = require('events')
const createDebug = require('debug')

module.exports = class Client extends EventEmitter {
    constructor(id, nodeToNode) {
        super()

        this.id = id
        this.nodeId = null
        this.nodeAddress = null
        this.protocols = {
            nodeToNode
        }

        this.debug = createDebug(`streamr:logic:client:${this.id}`)
        this.debug('node: %s is running', this.id)
    }

    connectToNode(nodeAddress) {
        this.nodeAddress = nodeAddress
        return this.protocols.nodeToNode.connectToNode(nodeAddress)
            .then((nodeId) => {
                this.nodeId = nodeId
            })
    }

    publish(messageId, previousMessageReference, data) {
        if (this.nodeId) {
            this.debug('publishing data %s', messageId)
            this.protocols.nodeToNode.sendData(this.nodeId, messageId, previousMessageReference, data).catch((err) => {
                console.error(`Failed to send data to node ${this.nodeId} because of ${err}, trying to reconnect`)
                this.connectToNode(this.nodeAddress).catch((errr) => {
                    console.error(`Still problems "${errr}" with connection to ${this.nodeId}`)
                })
            })
        } else {
            throw new Error('Failed to publish because node not set.')
        }
    }

    subscribe(streamId) {
        if (this.nodeId) {
            this.debug('subscribing to stream %s', streamId)
            this.protocols.nodeToNode.sendSubscribe(this.nodeId, streamId, true)
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
