const { Utils } = require('streamr-network').Protocol

const logger = require('./helpers/logger')('streamr:Stream')

module.exports = class Stream {
    constructor(id, partition, name, msgHandler, gapHandler) {
        this.id = id
        this.name = name
        this.partition = partition
        this.state = 'init'
        this.connections = []
        this.orderingUtil = new Utils.OrderingUtil(id, partition, msgHandler, (...args) => {
            gapHandler(id, partition, ...args)
        })
        this.orderingUtil.on('error', (err) => {
            // attach error handler in attempt to avoid uncaught exceptions
            logger.warn(err)
        })
    }

    passToOrderingUtil(streamMessage) {
        this.orderingUtil.add(streamMessage)
    }

    clearOrderingUtil() {
        this.orderingUtil.clearGaps()
    }

    addConnection(connection) {
        this.connections.push(connection)
    }

    removeConnection(connection) {
        const index = this.connections.indexOf(connection)
        if (index > -1) {
            this.connections.splice(index, 1)
        }
    }

    forEachConnection(cb) {
        this.getConnections().forEach(cb)
    }

    getConnections() {
        return this.connections
    }

    setSubscribing() {
        this.state = 'subscribing'
    }

    setSubscribed() {
        this.state = 'subscribed'
    }

    isSubscribing() {
        return this.state === 'subscribing'
    }

    isSubscribed() {
        return this.state === 'subscribed'
    }

    toString() {
        return `${this.id}::${this.partition}`
    }

    getName() {
        return this.name
    }

    getId() {
        return this.id
    }

    getPartition() {
        return this.partition
    }
}
