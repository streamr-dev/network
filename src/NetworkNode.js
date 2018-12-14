const DataMessage = require('./messages/DataMessage')
const Node = require('./logic/Node')
const { StreamID } = require('./identifiers')

/*
Convenience wrapper for broker/data-api. We can replace this with something else later.
 */
module.exports = class NetworkNode extends Node {
    publish(streamId, streamPartition, content, number, previousNumber) {
        const dataMessage = new DataMessage(new StreamID(streamId, streamPartition), content, number, previousNumber)
        this.onDataReceived(dataMessage)
    }

    addMessageListener(cb) {
        this.on(Node.events.MESSAGE_RECEIVED, (dataMessage) => {
            const streamId = dataMessage.getStreamId()
            cb(
                streamId.id,
                streamId.key,
                dataMessage.getData(),
                dataMessage.getNumber(),
                dataMessage.getPreviousNumber()
            )
        })
    }

    subscribe(streamId, streamPartition) {
        this.subscribeToStreamIfHaveNotYet(new StreamID(streamId, streamPartition))
    }

    unsubscribe(streamId, streamPartition) {
        if (streamPartition !== 0) {
            throw new Error('Stream partitions not yet supported.')
        }
        // TODO: do it
    }
}
