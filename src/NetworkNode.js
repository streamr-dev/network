const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const { StorageResendStrategy,
    AskNeighborsResendStrategy,
    StorageNodeResendStrategy } = require('./logic/resendStrategies')
const Node = require('./logic/Node')
const { StreamIdAndPartition } = require('./identifiers')

const { StreamMessage } = MessageLayer

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
        signatureType,
        signature) {
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
        this.subscribeToStreamIfHaveNotYet(new StreamIdAndPartition(streamId, streamPartition))
    }

    unsubscribe(streamId, streamPartition) {
        this.unsubscribeFromStream(new StreamIdAndPartition(streamId, streamPartition))
    }

    requestResendLast(streamId, streamPartition, subId, number) {
        return this.requestResend(
            ControlLayer.ResendLastRequest.create(streamId, streamPartition, subId, number), null
        )
    }

    requestResendFrom(streamId, streamPartition, subId, fromTimestamp, fromSequenceNo, publisherId, msgChainId) {
        return this.requestResend(
            ControlLayer.ResendFromRequest.create(streamId, streamPartition, subId, [fromTimestamp, fromSequenceNo], publisherId, msgChainId), null
        )
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
        )
    }

    _emitMessage(streamMessage) {
        this.emit(events.MESSAGE, streamMessage)
    }

    _emitUnicast(unicastMessage) {
        this.emit(events.UNICAST, unicastMessage)
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

        this.emit(eventType, resendResponse)
    }
}

NetworkNode.events = events

module.exports = NetworkNode
