const { EventEmitter } = require('events')
const debug = require('debug')('streamr:publisher')
const encoder = require('../helpers/MessageEncoder')
const { generateClientId } = require('../util')

module.exports = class Publisher extends EventEmitter {
    constructor(connection, nodeAddress) {
        super()

        this.connection = connection
        this.publisherId = generateClientId('publisher')
        this.nodeAddress = nodeAddress

        this.connection.once('node:ready', () => this.onNodeReady())
    }

    onNodeReady() {
        debug('node: %s is running\n\n\n', this.publisherId)
    }

    publishLibP2P(streamdId, data) {
        debug('publishing data', streamdId, data)
        this.connection.node.pubsub.publish(
            streamdId,
            Buffer.from(data),
            () => {}
        )
    }

    publish(streamdId, data) {
        if (this.nodeAddress) {
            debug('publishing data', streamdId, data)
            this.connection.send(this.nodeAddress, encoder.dataMessage(streamdId, data))
        }
    }
}
