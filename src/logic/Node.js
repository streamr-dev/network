const { EventEmitter } = require('events')

const createDebug = require('debug')
const LRU = require('lru-cache')
const allSettled = require('promise.allsettled')

const NodeToNode = require('../protocol/NodeToNode')
const TrackerNode = require('../protocol/TrackerNode')
const MessageBuffer = require('../helpers/MessageBuffer')
const { disconnectionReasons } = require('../messages/messageTypes')
const { StreamIdAndPartition } = require('../identifiers')
const Metrics = require('../metrics')
const { GapMisMatchError, InvalidNumberingError } = require('../logic/DuplicateMessageDetector')

const StreamManager = require('./StreamManager')
const ResendHandler = require('./ResendHandler')
const proxyRequestStream = require('./proxyRequestStream')

const events = Object.freeze({
    MESSAGE_RECEIVED: 'streamr:node:message-received',
    UNSEEN_MESSAGE_RECEIVED: 'streamr:node:unseen-message-received',
    MESSAGE_PROPAGATED: 'streamr:node:message-propagated',
    NODE_SUBSCRIBED: 'streamr:node:subscribed-successfully',
    NODE_UNSUBSCRIBED: 'streamr:node:node-unsubscribed',
    NODE_DISCONNECTED: 'streamr:node:node-disconnected',
    SUBSCRIPTION_REQUEST: 'streamr:node:subscription-received',
    RESEND_REQUEST_RECEIVED: 'streamr:node:resend-request-received',
})

const MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION = 1

const messageIdToStr = ({
    streamId, streamPartition, timestamp, sequenceNumber, publisherId, msgChainId
}) => `${streamId}-${streamPartition}-${timestamp}-${sequenceNumber}-${publisherId}-${msgChainId}`

class Node extends EventEmitter {
    constructor(opts) {
        super()

        // set default options
        const defaultOptions = {
            connectToBootstrapTrackersInterval: 5000,
            sendStatusToAllTrackersInterval: 1000,
            bufferTimeoutInMs: 60 * 1000,
            bufferMaxSize: 10000,
            protocols: [],
            resendStrategies: []
        }

        this.opts = {
            ...defaultOptions, ...opts
        }

        if (!(this.opts.protocols.trackerNode instanceof TrackerNode) || !(this.opts.protocols.nodeToNode instanceof NodeToNode)) {
            throw new Error('Provided protocols are not correct')
        }

        this.connectToBoostrapTrackersInterval = setInterval(
            this._connectToBootstrapTrackers.bind(this),
            this.opts.connectToBootstrapTrackersInterval
        )
        this.sendStatusTimeout = null
        this.bootstrapTrackerAddresses = []
        this.protocols = this.opts.protocols
        this.peerInfo = this.opts.peerInfo

        this.streams = new StreamManager()
        this.messageBuffer = new MessageBuffer(this.opts.bufferTimeoutInMs, this.opts.bufferMaxSize)
        this.resendHandler = new ResendHandler(this.opts.resendStrategies, console.error.bind(console))

        this.trackers = new Set()

        this.protocols.trackerNode.on(TrackerNode.events.CONNECTED_TO_TRACKER, (tracker) => this.onConnectedToTracker(tracker))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED, (streamMessage) => this.onTrackerInstructionReceived(streamMessage))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_DISCONNECTED, (tracker) => this.onTrackerDisconnected(tracker))
        this.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, (broadcastMessage, source) => this.onDataReceived(broadcastMessage.streamMessage, source))
        this.protocols.nodeToNode.on(NodeToNode.events.SUBSCRIBE_REQUEST, (subscribeMessage, source) => this.onSubscribeRequest(subscribeMessage, source))
        this.protocols.nodeToNode.on(NodeToNode.events.UNSUBSCRIBE_REQUEST, (unsubscribeMessage, source) => this.onUnsubscribeRequest(unsubscribeMessage, source))
        this.protocols.nodeToNode.on(NodeToNode.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))
        this.protocols.nodeToNode.on(NodeToNode.events.RESEND_REQUEST, (request, source) => this.requestResend(request, source))
        this.on(events.NODE_SUBSCRIBED, ({ streamId }) => {
            this._handleBufferedMessages(streamId)
            this._sendStatusToAllTrackers()
        })

        this.debug = createDebug(`streamr:logic:node:${this.peerInfo.peerId}`)
        this.debug('started %s', this.peerInfo.peerId)

        this.started = new Date().toLocaleString()
        this.metrics = new Metrics(this.peerInfo.peerId)

        this.seenButNotPropagated = new LRU({
            max: this.opts.bufferMaxSize,
            maxAge: this.opts.bufferMaxSize
        })
    }

    onConnectedToTracker(tracker) {
        this.debug('connected to tracker %s', tracker)
        this.trackers.add(tracker)
        this._sendStatus(tracker)
    }

    subscribeToStreamIfHaveNotYet(streamId) {
        if (!this.streams.isSetUp(streamId)) {
            this.debug('add %s to streams', streamId)
            this.streams.setUpStream(streamId)
            this._sendStatusToAllTrackers()
        }
    }

    unsubscribeFromStream(streamId) {
        this.debug('unsubscribeFromStream: remove %s from streams', streamId)
        const nodes = this.streams.removeStream(streamId)
        nodes.forEach(async (n) => {
            try {
                await this.protocols.nodeToNode.sendUnsubscribe(n, streamId)
            } catch (e) {
                this.debug('unsubscribed, but failed to send unsubscribe request for the stream %s because of %j', streamId, e)
            }
        })
        this._sendStatusToAllTrackers()
    }

    requestResend(request, source) {
        this.metrics.inc('requestResend')
        this.debug('received %s resend request %s with requestId %s',
            source === null ? 'local' : `from ${source}`,
            request.constructor.name,
            request.requestId)
        this.emit(events.RESEND_REQUEST_RECEIVED, request, source)

        const requestStream = this.resendHandler.handleRequest(request, source)
        if (source != null) {
            proxyRequestStream(
                async (data) => {
                    try {
                        await this.protocols.nodeToNode.send(source, data)
                    } catch (e) {
                        // TODO: catch specific error
                        const requests = this.resendHandler.cancelResendsOfNode(source)
                        console.warn('Failed to send resend response to %s,\n\tcancelling resends %j,\n\tError %s',
                            source, requests, e)
                    }
                },
                request,
                requestStream
            )
        }
        return requestStream
    }

    async onTrackerInstructionReceived(instructionMessage) {
        this.metrics.inc('onTrackerInstructionReceived')
        const streamId = instructionMessage.getStreamId()
        const nodeAddresses = instructionMessage.getNodeAddresses()
        const nodeIds = []

        this.debug('received instructions for %s, nodes to connect %o', streamId, nodeAddresses)
        this.subscribeToStreamIfHaveNotYet(streamId)

        const connectedNodes = []
        await allSettled(nodeAddresses.map((nodeAddress) => this.protocols.nodeToNode.connectToNode(nodeAddress))).then((results) => {
            results.forEach((result) => {
                if (result.status === 'fulfilled') {
                    connectedNodes.push(result.value)
                } else {
                    this.debug(`failed to connect to node ${result.reason}`)
                }
            })
        })

        if (connectedNodes.length) {
            await allSettled(connectedNodes.map((nodeId) => this._subscribeToStreamOnNode(nodeId, streamId))).then((results) => {
                results.forEach((result) => {
                    if (result.status === 'fulfilled') {
                        nodeIds.push(result.value)
                    } else {
                        this.debug(`failed to subscribe to node ${result.reason}`)
                    }
                })
            })
        }

        if (nodeAddresses.length !== nodeIds.length) {
            this.debug('error: failed to fulfill tracker instructions')
        }

        const currentNodes = this.streams.isSetUp(streamId) ? this.streams.getAllNodesForStream(streamId) : []
        const nodesToUnsubscribeFrom = currentNodes.filter((node) => !nodeIds.includes(node))

        await allSettled(nodesToUnsubscribeFrom.map((nodeId) => this._unsubscribeFromStreamOnNode(nodeId, streamId))).then((results) => {
            results.forEach((result) => {
                if (result.status === 'rejected') {
                    this.debug(`failed to unsubscribe to node ${result.reason}`)
                }
            })
        })
    }

    onDataReceived(streamMessage, source = null) {
        this.metrics.inc('onDataReceived')
        const streamIdAndPartition = new StreamIdAndPartition(streamMessage.getStreamId(), streamMessage.getStreamPartition())

        this.emit(events.MESSAGE_RECEIVED, streamMessage, source)

        this.subscribeToStreamIfHaveNotYet(streamIdAndPartition)

        // Check duplicate
        let isUnseen
        try {
            isUnseen = this.streams.markNumbersAndCheckThatIsNotDuplicate(
                streamMessage.messageId,
                streamMessage.prevMsgRef
            )
        } catch (e) {
            if (e instanceof InvalidNumberingError) {
                this.debug('received from %s data %j with invalid numbering', source, streamMessage.messageId)
                this.metrics.inc('onDataReceived:ignoring:invalid-numbering')
                return
            }
            if (e instanceof GapMisMatchError) {
                console.warn(e)
                this.debug('received from %s data %j with gap mismatch detected', source, streamMessage.messageId)
                this.metrics.inc('onDataReceived:ignoring:gap-mismatch')
                return
            }
            throw e
        }

        if (isUnseen) {
            this.emit(events.UNSEEN_MESSAGE_RECEIVED, streamMessage, source)
        }
        if (isUnseen || this.seenButNotPropagated.has(messageIdToStr(streamMessage.messageId))) {
            this.debug('received from %s data %j', source, streamMessage.messageId)
            this._propagateMessage(streamMessage, source)
        } else {
            this.debug('ignoring duplicate data %j (from %s)', streamMessage.messageId, source)
            this.metrics.inc('onDataReceived:ignoring:duplicate')
        }
    }

    _propagateMessage(streamMessage, source) {
        this.metrics.inc('_propagateMessage')
        const streamIdAndPartition = new StreamIdAndPartition(streamMessage.getStreamId(), streamMessage.getStreamPartition())

        const subscribers = this.streams.getOutboundNodesForStream(streamIdAndPartition).filter((n) => n !== source)

        if (subscribers.length) {
            subscribers.forEach((subscriber) => {
                this.protocols.nodeToNode.sendData(subscriber, streamMessage)
            })

            this.seenButNotPropagated.del(messageIdToStr(streamMessage.messageId))
            this.emit(events.MESSAGE_PROPAGATED, streamMessage)
        } else {
            this.debug('put %j back to buffer because could not propagate to %d nodes or more',
                streamMessage.messageId, MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION)
            this.seenButNotPropagated.set(messageIdToStr(streamMessage.messageId), true)
            this.messageBuffer.put(streamIdAndPartition.key(), [streamMessage, source])
        }
    }

    onSubscribeRequest(subscribeMessage, source) {
        this.metrics.inc('onSubscribeRequest')
        const streamId = new StreamIdAndPartition(subscribeMessage.streamId, subscribeMessage.streamPartition)
        this.emit(events.SUBSCRIPTION_REQUEST, {
            streamId,
            source
        })

        if (this.streams.isSetUp(streamId)) {
            this.subscribeToStreamIfHaveNotYet(streamId)

            this.streams.addOutboundNode(streamId, source)
            this.streams.addInboundNode(streamId, source)

            this.debug('node %s subscribed to stream %s', source, streamId)
            this.emit(events.NODE_SUBSCRIBED, {
                streamId,
                source
            })
        } else {
            this.debug('node %s tried to subscribe to stream %s, but it is not setup', source, streamId)
            this.protocols.nodeToNode.sendUnsubscribe(source, streamId).catch((e) => {
                console.error(`failed to send sendUnsubscribe to ${source}, because stream ${streamId} is not setUp, error ${e}`)
            })
        }
    }

    onUnsubscribeRequest(unsubscribeMessage, source) {
        const streamIdAndPartition = new StreamIdAndPartition(unsubscribeMessage.streamId, unsubscribeMessage.streamPartition)

        if (this.streams.isSetUp(streamIdAndPartition)) {
            this.metrics.inc('onUnsubscribeRequest')
            this.streams.removeNodeFromStream(streamIdAndPartition, source)
            this.debug('node %s unsubscribed from stream %s', source, streamIdAndPartition)
            this.emit(events.NODE_UNSUBSCRIBED, source, streamIdAndPartition)
            this._sendStatusToAllTrackers()
        }
        if (!this.streams.isNodePresent(source)) {
            this.protocols.nodeToNode.disconnectFromNode(source, disconnectionReasons.NO_SHARED_STREAMS)
        }
    }

    stop() {
        this.debug('stopping')
        this.resendHandler.stop()
        this._clearConnectToBootstrapTrackersInterval()
        this._disconnectFromAllNodes()
        this._disconnectFromTrackers()
        this.messageBuffer.clear()
        return this.protocols.nodeToNode.stop()
    }

    _disconnectFromTrackers() {
        this.trackers.forEach((tracker) => {
            this.protocols.nodeToNode.disconnectFromNode(tracker, disconnectionReasons.GRACEFUL_SHUTDOWN)
        })
    }

    _disconnectFromAllNodes() {
        this.streams.getAllNodes().forEach((node) => {
            this.protocols.nodeToNode.disconnectFromNode(node, disconnectionReasons.GRACEFUL_SHUTDOWN)
        })
    }

    _getStatus() {
        return {
            streams: this.streams.getStreamsWithConnections(),
            started: this.started
        }
    }

    _sendStatusToAllTrackers() {
        clearTimeout(this.sendStatusTimeout)
        this.sendStatusTimeout = setTimeout(() => {
            this.trackers.forEach((tracker) => this._sendStatus(tracker))
        }, this.opts.sendStatusToAllTrackersInterval)
    }

    async _sendStatus(tracker) {
        const status = this._getStatus()

        try {
            await this.protocols.trackerNode.sendStatus(tracker, status)
            this.debug('sent status %j to tracker %s', status.streams, tracker)
        } catch (e) {
            this.debug('failed to send status to tracker %s (%s)', tracker, e)
        }
    }

    // eslint-disable-next-line consistent-return
    async _subscribeToStreamOnNode(node, streamId) {
        return this.protocols.nodeToNode.sendSubscribe(node, streamId).then((nodeId) => {
            this.streams.addInboundNode(streamId, node)
            this.streams.addOutboundNode(streamId, node)

            // TODO get prove message from node that we successfully subscribed
            this.emit(events.NODE_SUBSCRIBED, {
                streamId,
                node
            })

            return nodeId
        })
    }

    async _unsubscribeFromStreamOnNode(node, streamId) {
        this.streams.removeNodeFromStream(streamId, node)

        if (!this.streams.isNodePresent(node)) {
            this.protocols.nodeToNode.disconnectFromNode(node, disconnectionReasons.NO_SHARED_STREAMS)
            return node
        }

        return this.protocols.nodeToNode.sendUnsubscribe(node, streamId)
    }

    onNodeDisconnected(node) {
        this.metrics.inc('onNodeDisconnected')
        this.resendHandler.cancelResendsOfNode(node)
        this.streams.removeNodeFromAllStreams(node)
        this.debug('removed all subscriptions of node %s', node)
        this._sendStatusToAllTrackers()
        this.emit(events.NODE_DISCONNECTED, node)
    }

    onTrackerDisconnected(tracker) {
        this.trackers.delete(tracker)
    }

    _handleBufferedMessages(streamId) {
        this.messageBuffer.popAll(streamId.key())
            .forEach(([streamMessage, source]) => {
                // TODO bad idea to call events directly
                this.onDataReceived(streamMessage, source)
            })
    }

    addBootstrapTracker(trackerAddress) {
        this.bootstrapTrackerAddresses.push(trackerAddress)
        this._connectToBootstrapTrackers()
    }

    _connectToBootstrapTrackers() {
        this.bootstrapTrackerAddresses.forEach((address) => {
            this.protocols.trackerNode.connectToTracker(address)
                .catch((err) => {
                    console.error('Could not connect to tracker %s because %j', address, err.toString())
                })
        })
    }

    _clearConnectToBootstrapTrackersInterval() {
        if (this.connectToBoostrapTrackersInterval) {
            clearInterval(this.connectToBoostrapTrackersInterval)
            this.connectToBoostrapTrackersInterval = null
        }
    }

    async getMetrics() {
        const endpointMetrics = this.protocols.nodeToNode.endpoint.getMetrics()
        const processMetrics = await this.metrics.getPidusage()
        const nodeMetrics = this.metrics.report()
        const mainMetrics = this.metrics.prettify(endpointMetrics)
        const resendMetrics = this.resendHandler.metrics()

        return {
            mainMetrics,
            endpointMetrics,
            processMetrics,
            nodeMetrics,
            resendMetrics,
            messageBufferSize: this.messageBuffer.size(),
            seenButNotPropagated: this.seenButNotPropagated.length
        }
    }
}

Node.events = events

module.exports = Node
