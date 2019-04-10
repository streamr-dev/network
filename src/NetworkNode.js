const DataMessage = require('./messages/DataMessage')
const ResendLastRequest = require('./messages/ResendLastRequest')
const ResendFromRequest = require('./messages/ResendFromRequest')
const ResendRangeRequest = require('./messages/ResendRangeRequest')
const Node = require('./logic/Node')
const { StreamID, MessageID, MessageReference } = require('./identifiers')

/*
Convenience wrapper for broker/data-api. We can replace this with something else later.
 */
module.exports = class NetworkNode extends Node {
    publish(streamId,
        streamPartition,
        timestamp,
        sequenceNo,
        publisherId,
        msgChainId,
        previousTimestamp,
        previousSequenceNo,
        content,
        signature,
        signatureType) {
        const dataMessage = new DataMessage(
            new MessageID(new StreamID(streamId, streamPartition), timestamp, sequenceNo, publisherId, msgChainId),
            previousTimestamp != null ? new MessageReference(previousTimestamp, previousSequenceNo) : null,
            content,
            signature,
            signatureType
        )
        this.onDataReceived(dataMessage)
    }

    addMessageListener(cb) {
        this.on(Node.events.MESSAGE_PROPAGATED, (dataMessage) => {
            const messageId = dataMessage.getMessageId()
            const previousMessageReference = dataMessage.getPreviousMessageReference()
            const { streamId } = messageId

            cb(
                streamId.id,
                streamId.partition,
                messageId.timestamp,
                messageId.sequenceNo,
                messageId.publisherId,
                messageId.msgChainId,
                previousMessageReference ? previousMessageReference.timestamp : null,
                previousMessageReference ? previousMessageReference.sequenceNo : null,
                dataMessage.getData()
            )
        })
    }

    subscribe(streamId, streamPartition) {
        this.subscribeToStreamIfHaveNotYet(new StreamID(streamId, streamPartition))
    }

    unsubscribe(streamId, streamPartition) {
        this.unsubscribeFromStream(new StreamID(streamId, streamPartition))
    }

    requestResendLast(streamId, streamPartition, subId, number) {
        this.requestResend(new ResendLastRequest(new StreamID(streamId, streamPartition), subId, number, null))
    }

    requestResendFrom(streamId, streamPartition, subId, fromTimestamp, fromSequenceNo, publisherId) {
        this.requestResend(new ResendFromRequest(
            new StreamID(streamId, streamPartition),
            subId,
            new MessageReference(fromTimestamp, fromSequenceNo),
            publisherId,
            null
        ))
    }

    requestResendRange(streamId,
        streamPartition,
        subId,
        fromTimestamp,
        fromSequenceNo,
        toTimestamp,
        toSequenceNo,
        publisherId) {
        this.requestResend(new ResendRangeRequest(
            new StreamID(streamId, streamPartition),
            subId,
            new MessageReference(fromTimestamp, fromSequenceNo),
            new MessageReference(toTimestamp, toSequenceNo),
            publisherId,
            null
        ))
    }
}
