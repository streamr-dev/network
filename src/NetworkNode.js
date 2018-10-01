const DataMessage = require('./messages/DataMessage')
const Node = require('./logic/Node')

/*
Convenience wrapper for broker/data-api. We can replace this with something else later.
 */
module.exports = class NetworkNode extends Node {
    publish(streamId, streamPartition, content) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }

        const dataMessage = new DataMessage()
        dataMessage.setStreamId(streamId)
        dataMessage.setPayload(content)

        this.onDataReceived(dataMessage)
    }

    addMessageListener(cb) {
        this.on(Node.events.MESSAGE_RECEIVED, (dataMessage) => cb(dataMessage.getStreamId(), 0, dataMessage.getPayload()))
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
