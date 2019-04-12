const DataMessage = require('./messages/DataMessage')
const ResendLastRequest = require('./messages/ResendLastRequest')
const ResendFromRequest = require('./messages/ResendFromRequest')
const ResendRangeRequest = require('./messages/ResendRangeRequest')
const ResendResponseNoResend = require('./messages/ResendResponseNoResend')
const ResendResponseResent = require('./messages/ResendResponseResent')
const ResendResponseResending = require('./messages/ResendResponseResending')
const { StorageResendStrategy } = require('./logic/resendStrategies')
const Node = require('./logic/Node')
const { StreamID, MessageID, MessageReference } = require('./identifiers')

const events = Object.freeze({
    MESSAGE: 'streamr:networkNode:message-received',
    UNICAST: 'streamr:networkNode:unicast',
    NO_RESEND: 'streamr:networkNode:no-resend',
    RESENDING: 'streamr:networkNode:resending',
    RESENT: 'streamr:networkNode:resent',
})

/*
Convenience wrapper for building client-facing functionality. Used by broker.
 */
class NetworkNode extends Node {
    constructor(id, trackerNode, nodeToNode, storages) {
        super(id, trackerNode, nodeToNode, storages.map((storage) => new StorageResendStrategy(storage)))
        storages.forEach((storage) => this.on(events.MESSAGE, storage.store.bind(storage)))

        this.on(Node.events.MESSAGE_PROPAGATED, this._emitMessage.bind(this))
        this.on(Node.events.UNICAST_RECEIVED, this._emitUnicast.bind(this))
        this.on(Node.events.RESEND_RESPONSE_RECEIVED, this._emitResendResponse.bind(this))
    }

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

    // Convenience function
    addMessageListener(cb) {
        this.on(events.MESSAGE, cb)
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

    _emitMessage(dataMessage) {
        const messageId = dataMessage.getMessageId()
        const previousMessageReference = dataMessage.getPreviousMessageReference()
        const { streamId } = messageId

        this.emit(events.MESSAGE, {
            streamId: streamId.id,
            streamPartition: streamId.partition,
            timestamp: messageId.timestamp,
            sequenceNo: messageId.sequenceNo,
            publisherId: messageId.publisherId,
            msgChainId: messageId.msgChainId,
            previousTimestamp: previousMessageReference ? previousMessageReference.timestamp : null,
            previousSequenceNo: previousMessageReference ? previousMessageReference.sequenceNo : null,
            data: dataMessage.getData(),
            signature: dataMessage.getSignature(),
            signatureType: dataMessage.getSignatureType()
        })
    }

    _emitUnicast(unicastMessage) {
        const messageId = unicastMessage.getMessageId()
        const previousMessageReference = unicastMessage.getPreviousMessageReference()
        const { streamId } = messageId

        this.emit(events.UNICAST, {
            streamId: streamId.id,
            streamPartition: streamId.partition,
            timestamp: messageId.timestamp,
            sequenceNo: messageId.sequenceNo,
            publisherId: messageId.publisherId,
            msgChainId: messageId.msgChainId,
            previousTimestamp: previousMessageReference ? previousMessageReference.timestamp : null,
            previousSequenceNo: previousMessageReference ? previousMessageReference.sequenceNo : null,
            data: unicastMessage.getData(),
            signature: unicastMessage.getSignature(),
            signatureType: unicastMessage.getSignatureType(),
            subId: unicastMessage.getSubId()
        })
    }

    _emitResendResponse(resendResponse) {
        let eventType
        if (resendResponse instanceof ResendResponseNoResend) {
            eventType = events.NO_RESEND
        } else if (resendResponse instanceof ResendResponseResending) {
            eventType = events.RESENDING
        } else if (resendResponse instanceof ResendResponseResent) {
            eventType = events.RESENT
        } else {
            throw new Error(`unexpected resendResponse ${resendResponse}`)
        }

        this.emit(eventType, {
            streamId: resendResponse.getStreamId().id,
            streamPartition: resendResponse.getStreamId().partition,
            subId: resendResponse.getSubId()
        })
    }
}

NetworkNode.events = events

module.exports = NetworkNode
