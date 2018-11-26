const DataMessage = require('./messages/DataMessage')
const Node = require('./logic/Node')

/*
Convenience wrapper for broker/data-api. We can replace this with something else later.
 */
module.exports = class NetworkNode extends Node {
    publish(streamId, streamPartition, content, number, previousNumber) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }

        const dataMessage = new DataMessage(streamId, content, number, previousNumber)
        this.onDataReceived(dataMessage)
    }

    addMessageListener(cb) {
        this.on(Node.events.MESSAGE_RECEIVED, (dataMessage) => {
            cb(dataMessage.getStreamId(), 0, dataMessage.getData(), dataMessage.getNumber(), dataMessage.getPreviousNumber())
        })
    }

    subscribe(streamId, streamPartition) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }
        this.subscribeToStreamIfHaveNotYet(streamId)
    }

    unsubscribe(streamId, streamPartition) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }
        // TODO: do it
    }
}
