const { Transform } = require('stream')
const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const { StorageResendStrategy,
    AskNeighborsResendStrategy,
    StorageNodeResendStrategy } = require('./logic/resendStrategies')
const Node = require('./logic/Node')
const { StreamID } = require('./identifiers')

const { StreamMessage } = MessageLayer

const events = Object.freeze({
    MESSAGE: 'streamr:networkNode:message-received',
    UNICAST: 'streamr:networkNode:unicast',
    NO_RESEND: 'streamr:networkNode:no-resend',
    RESENDING: 'streamr:networkNode:resending',
    RESENT: 'streamr:networkNode:resent',
})

function unicastMessageToObject(unicastMessage) {
    const { streamMessage } = unicastMessage
    const { messageId } = streamMessage
    const previousMessageReference = streamMessage.prevMsgRef
    return {
        streamId: messageId.streamId,
        streamPartition: messageId.streamPartition,
        timestamp: messageId.timestamp,
        sequenceNo: messageId.sequenceNumber,
        publisherId: messageId.publisherId,
        msgChainId: messageId.msgChainId,
        previousTimestamp: previousMessageReference ? previousMessageReference.timestamp : null,
        previousSequenceNo: previousMessageReference ? previousMessageReference.sequenceNumber : null,
        data: streamMessage.getParsedContent(),
        signature: streamMessage.signature,
        signatureType: streamMessage.signatureType,
        subId: unicastMessage.subId
    }
}

function toObjectTransform() {
    return new Transform({
        objectMode: true,
        transform: ([unicastMessage, source], _, done) => {
            done(null, unicastMessageToObject(unicastMessage))
        }
    })
}

/*
Convenience wrapper for building client-facing functionality. Used by broker.
 */
class NetworkNode extends Node {
    constructor(opts) {
        let networkOpts = {
            resendStrategies: [
                ...opts.storages.map((storage) => new StorageResendStrategy(storage)),
                new AskNeighborsResendStrategy(opts.protocols.nodeToNode, (streamId) => {
                    return this.streams.getOutboundNodesForStream(streamId)
                }),
                new StorageNodeResendStrategy(opts.protocols.trackerNode, opts.protocols.nodeToNode,
                    () => [...this.trackers][0],
                    (node) => this.streams.isNodePresent(node))
            ]
        }

        networkOpts = Object.assign({}, opts, networkOpts)

        super(networkOpts)
        this.opts.storages.forEach((storage) => this.on(events.MESSAGE, storage.store.bind(storage)))

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
        const streamMessage = StreamMessage.create(
            [streamId, streamPartition, timestamp, sequenceNo, publisherId, msgChainId],
            previousTimestamp != null ? [previousTimestamp, previousSequenceNo] : null,
            StreamMessage.CONTENT_TYPES.JSON,
            content,
            signatureType,
            signature
        )
        this.onDataReceived(streamMessage)
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
        return this.requestResend(
            ControlLayer.ResendLastRequest.create(streamId, streamPartition, subId, number), null
        ).pipe(toObjectTransform())
    }

    requestResendFrom(streamId, streamPartition, subId, fromTimestamp, fromSequenceNo, publisherId, msgChainId) {
        return this.requestResend(
            ControlLayer.ResendFromRequest.create(streamId, streamPartition, subId, [fromTimestamp, fromSequenceNo], publisherId, msgChainId), null
        ).pipe(toObjectTransform())
    }

    requestResendRange(streamId,
        streamPartition,
        subId,
        fromTimestamp,
        fromSequenceNo,
        toTimestamp,
        toSequenceNo,
        publisherId,
        msgChainId) {
        return this.requestResend(
            ControlLayer.ResendRangeRequest.create(streamId, streamPartition, subId, [fromTimestamp, fromSequenceNo],
                [toTimestamp, toSequenceNo], publisherId, msgChainId), null
        ).pipe(toObjectTransform())
    }

    _emitMessage(streamMessage) {
        const { messageId } = streamMessage
        const previousMessageReference = streamMessage.prevMsgRef

        this.emit(events.MESSAGE, {
            streamId: messageId.streamId,
            streamPartition: messageId.streamPartition,
            timestamp: messageId.timestamp,
            sequenceNo: messageId.sequenceNumber,
            publisherId: messageId.publisherId,
            msgChainId: messageId.msgChainId,
            previousTimestamp: previousMessageReference ? previousMessageReference.timestamp : null,
            previousSequenceNo: previousMessageReference ? previousMessageReference.sequenceNumber : null,
            data: streamMessage.getParsedContent(),
            signature: streamMessage.signature,
            signatureType: streamMessage.signatureType
        })
    }

    _emitUnicast(unicastMessage) {
        this.emit(events.UNICAST, unicastMessageToObject(unicastMessage))
    }

    _emitResendResponse(resendResponse) {
        let eventType
        if (resendResponse.type === ControlLayer.ResendResponseNoResend.TYPE) {
            eventType = events.NO_RESEND
        } else if (resendResponse.type === ControlLayer.ResendResponseResending.TYPE) {
            eventType = events.RESENDING
        } else if (resendResponse.type === ControlLayer.ResendResponseResent.TYPE) {
            eventType = events.RESENT
        } else {
            throw new Error(`unexpected resendResponse ${resendResponse}`)
        }

        this.emit(eventType, {
            streamId: resendResponse.streamId,
            streamPartition: resendResponse.streamPartition,
            subId: resendResponse.subId
        })
    }
}

NetworkNode.events = events

module.exports = NetworkNode
