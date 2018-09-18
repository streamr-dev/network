const { EventEmitter } = require('events')
const Node = require('./logic/Node')
const { callbackToPromise } = require('./util')

/*
Convenience wrapper for broker/data-api. We can replace this with something else later.
 */
module.exports = class NetworkNode extends EventEmitter {
    constructor(node) {
        super()
        this.node = node
    }

    publish(streamId, streamPartition, content) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }
        this.node.onDataReceived(streamId, content)
    }

    subscribe(streamId, streamPartition, cb) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }
        this.subscribed = true
        cb(null)
    }

    unsubscribe(streamId, streamPartition) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }
        this.unsubscribed = true
        // TODO: Do we even need?
    }

    addMessageListener(cb) {
        this.node.on(Node.events.MESSAGE_RECEIVED, (streamId, content) => cb(streamId, 0, content))
    }

    stop() {
        return callbackToPromise(this.node.stop.bind(this.node))
    }
}
