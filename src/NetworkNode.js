const { ControlLayer } = require('streamr-client-protocol')

const { StorageResendStrategy,
    AskNeighborsResendStrategy,
    StorageNodeResendStrategy } = require('./logic/resendStrategies')
const Node = require('./logic/Node')
const { StreamIdAndPartition } = require('./identifiers')

/*
Convenience wrapper for building client-facing functionality. Used by broker.
 */
class NetworkNode extends Node {
    constructor(opts) {
        const networkOpts = Object.assign({}, opts, {
            resendStrategies: [
                ...opts.storages.map((storage) => new StorageResendStrategy(storage)),
                new AskNeighborsResendStrategy(opts.protocols.nodeToNode, (streamId) => {
                    return this.streams.isSetUp(streamId) ? this.streams.getOutboundNodesForStream(streamId) : []
                }),
                new StorageNodeResendStrategy(
                    opts.protocols.trackerNode,
                    opts.protocols.nodeToNode,
                    () => [...this.trackers][0],
                    (node) => this.streams.isNodePresent(node)
                )
            ]
        })

        super(networkOpts)
        this.opts.storages.forEach((storage) => this.addMessageListener(storage.store.bind(storage)))
    }

    publish(streamMessage) {
        this.onDataReceived(streamMessage)
    }

    addMessageListener(cb) {
        this.on(Node.events.MESSAGE_PROPAGATED, cb)
    }

    subscribe(streamId, streamPartition) {
        this.subscribeToStreamIfHaveNotYet(new StreamIdAndPartition(streamId, streamPartition))
    }

    unsubscribe(streamId, streamPartition) {
        this.unsubscribeFromStream(new StreamIdAndPartition(streamId, streamPartition))
    }

    requestResendLast(streamId, streamPartition, subId, number) {
        const request = ControlLayer.ResendLastRequest.create(streamId, streamPartition, subId, number)
        return this.requestResend(request, null)
    }

    requestResendFrom(streamId, streamPartition, subId, fromTimestamp, fromSequenceNo, publisherId, msgChainId) {
        const request = ControlLayer.ResendFromRequest.create(
            streamId,
            streamPartition,
            subId,
            [fromTimestamp, fromSequenceNo],
            publisherId,
            msgChainId
        )
        return this.requestResend(request, null)
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
        const request = ControlLayer.ResendRangeRequest.create(
            streamId,
            streamPartition,
            subId,
            [fromTimestamp, fromSequenceNo],
            [toTimestamp, toSequenceNo],
            publisherId,
            msgChainId
        )
        return this.requestResend(request, null)
    }

    getStreams() {
        return this.streams.getStreamsAsKeys()
    }
}

module.exports = NetworkNode
