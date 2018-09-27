const Node = require('./logic/Node')

/*
Convenience wrapper for broker/data-api. We can replace this with something else later.
 */
module.exports = class NetworkNode extends Node {
    publish(streamId, streamPartition, content) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }
        this.onDataReceived(streamId, content)
    }

    addMessageListener(cb) {
        this.on(Node.events.MESSAGE_RECEIVED, (streamId, content) => cb(streamId, 0, content))
    }

    subscribe(streamId, streamPartition) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }
        return new Promise((resolve, reject) => {
            const subscribeCb = (subscribedStreamId) => {
                if (subscribedStreamId === streamId) {
                    this.removeListener(Node.events.SUBSCRIBED_TO_STREAM, subscribeCb)
                    resolve()
                }
            }
            this.on(Node.events.SUBSCRIBED_TO_STREAM, subscribeCb)
            this.subscribeToStream(streamId)
        })
    }

    unsubscribe(streamId, streamPartition) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }
        // TODO: do it
    }
}
