const { EventEmitter } = require('events')

const { Utils } = require('streamr-client-protocol')

const getLogger = require('../helpers/logger')
const NodeToNode = require('../protocol/NodeToNode')
const TrackerNode = require('../protocol/TrackerNode')
const MessageBuffer = require('../helpers/MessageBuffer')
const SeenButNotPropagatedSet = require('../helpers/SeenButNotPropagatedSet')
const { disconnectionReasons } = require('../connection/WsEndpoint')
const { StreamIdAndPartition } = require('../identifiers')
const ResendHandler = require('../resend/ResendHandler')
const proxyRequestStream = require('../resend/proxyRequestStream')
const MetricsContext = require('../helpers/MetricsContext')
const { promiseTimeout } = require('../helpers/PromiseTools')

const PerStreamMetrics = require('./PerStreamMetrics')
const { GapMisMatchError, InvalidNumberingError } = require('./DuplicateMessageDetector')
const StreamManager = require('./StreamManager')
const InstructionThrottler = require('./InstructionThrottler')

const events = Object.freeze({
    MESSAGE_RECEIVED: 'streamr:node:message-received',
    UNSEEN_MESSAGE_RECEIVED: 'streamr:node:unseen-message-received',
    MESSAGE_PROPAGATED: 'streamr:node:message-propagated',
    MESSAGE_PROPAGATION_FAILED: 'streamr:node:message-propagation-failed',
    NODE_SUBSCRIBED: 'streamr:node:subscribed-successfully',
    NODE_UNSUBSCRIBED: 'streamr:node:node-unsubscribed',
    NODE_CONNECTED: 'streamr:node:node-connected',
    NODE_DISCONNECTED: 'streamr:node:node-disconnected',
    RESEND_REQUEST_RECEIVED: 'streamr:node:resend-request-received',
})

const MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION = 1

class Node extends EventEmitter {
    constructor(opts) {
        super()

        // set default options
        const defaultOptions = {
            connectToBootstrapTrackersInterval: 5000,
            sendStatusToAllTrackersInterval: 1000,
            bufferTimeoutInMs: 60 * 1000,
            bufferMaxSize: 10000,
            disconnectionWaitTime: 30 * 1000,
            nodeConnectTimeout: 2000,
            protocols: [],
            resendStrategies: [],
            metricsContext: new MetricsContext(null)
        }
        this.opts = {
            ...defaultOptions, ...opts
        }

        if (!(this.opts.protocols.trackerNode instanceof TrackerNode) || !(this.opts.protocols.nodeToNode instanceof NodeToNode)) {
            throw new Error('Provided protocols are not correct')
        }
        if (!this.opts.trackers) {
            throw new Error('No trackers given')
        }

        this.logger = getLogger(`streamr:logic:node:${this.opts.peerInfo.peerId}`)
        this.sendStatusTimeout = new Map()
        this.disconnectionTimers = {}
        this.protocols = this.opts.protocols
        this.peerInfo = this.opts.peerInfo
        this.streams = new StreamManager()
        this.messageBuffer = new MessageBuffer(this.opts.bufferTimeoutInMs, this.opts.bufferMaxSize, (streamId) => {
            this.logger.debug(`failed to deliver buffered messages of stream ${streamId}`)
        })
        this.seenButNotPropagatedSet = new SeenButNotPropagatedSet()
        this.resendHandler = new ResendHandler(
            this.opts.resendStrategies,
            this.logger.error.bind(this.logger),
            this.opts.metricsContext
        )
        this.trackerRegistry = Utils.createTrackerRegistry(this.opts.trackers)
        this.trackerBook = {} // address => id
        this.started = new Date().toLocaleString()
        this.instructionThrottler = new InstructionThrottler(this.handleTrackerInstruction.bind(this))

        this.protocols.trackerNode.on(TrackerNode.events.CONNECTED_TO_TRACKER, (trackerId) => this.onConnectedToTracker(trackerId))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED, (streamMessage, trackerId) => this.onTrackerInstructionReceived(trackerId, streamMessage))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_DISCONNECTED, (trackerId) => this.onTrackerDisconnected(trackerId))
        this.protocols.nodeToNode.on(NodeToNode.events.NODE_CONNECTED, (nodeId) => this.emit(events.NODE_CONNECTED, nodeId))
        this.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, (broadcastMessage, nodeId) => this.onDataReceived(broadcastMessage.streamMessage, nodeId))
        this.protocols.nodeToNode.on(NodeToNode.events.SUBSCRIBE_REQUEST, (subscribeMessage, nodeId) => this.onSubscribeRequest(subscribeMessage, nodeId))
        this.protocols.nodeToNode.on(NodeToNode.events.UNSUBSCRIBE_REQUEST, (unsubscribeMessage, nodeId) => this.onUnsubscribeRequest(unsubscribeMessage, nodeId))
        this.protocols.nodeToNode.on(NodeToNode.events.NODE_DISCONNECTED, (nodeId) => this.onNodeDisconnected(nodeId))
        this.protocols.nodeToNode.on(NodeToNode.events.RESEND_REQUEST, (request, source) => this.requestResend(request, source))
        this.on(events.NODE_SUBSCRIBED, ({ streamId }) => {
            this._handleBufferedMessages(streamId)
            this._sendStreamStatus(streamId)
        })
        this.protocols.nodeToNode.on(NodeToNode.events.LOW_BACK_PRESSURE, (nodeId) => {
            this.resendHandler.resumeResendsOfNode(nodeId)
        })

        this.protocols.nodeToNode.on(NodeToNode.events.HIGH_BACK_PRESSURE, (nodeId) => {
            this.resendHandler.pauseResendsOfNode(nodeId)
        })

        let avgLatency = -1

        this.on(events.UNSEEN_MESSAGE_RECEIVED, (message) => {
            const now = new Date().getTime()
            const currentLatency = now - message.messageId.timestamp

            if (avgLatency < 0) {
                avgLatency = currentLatency
            } else {
                avgLatency = 0.8 * avgLatency + 0.2 * currentLatency
            }

            this.metrics.record('latency', avgLatency)
        })

        this.perStreamMetrics = new PerStreamMetrics()

        // .addQueriedMetric('perStream', () => this.perStreamMetrics.report()) NET-122
        this.metrics = this.opts.metricsContext.create('node')
            .addQueriedMetric('messageBufferSize', () => this.messageBuffer.size())
            .addQueriedMetric('seenButNotPropagatedSetSize', () => this.seenButNotPropagatedSet.size())
            .addRecordedMetric('resendRequests')
            .addRecordedMetric('unexpectedTrackerInstructions')
            .addRecordedMetric('trackerInstructions')
            .addRecordedMetric('onDataReceived')
            .addRecordedMetric('onDataReceived:invalidNumbering')
            .addRecordedMetric('onDataReceived:gapMismatch')
            .addRecordedMetric('onDataReceived:ignoredDuplicate')
            .addRecordedMetric('propagateMessage')
            .addRecordedMetric('onSubscribeRequest')
            .addRecordedMetric('onUnsubscribeRequest')
            .addRecordedMetric('onNodeDisconnect')
            .addRecordedMetric('latency')
    }

    start() {
        this.logger.debug('started %s (%s)', this.peerInfo.peerId, this.peerInfo.peerName)
        this._connectToBootstrapTrackers()
        this.connectToBoostrapTrackersInterval = setInterval(
            this._connectToBootstrapTrackers.bind(this),
            this.opts.connectToBootstrapTrackersInterval
        )
    }

    onConnectedToTracker(tracker) {
        this.logger.debug('connected to tracker %s', tracker)
        this.trackerBook[this.protocols.trackerNode.endpoint.resolveAddress(tracker)] = tracker
        this._sendStatus(tracker)
    }

    subscribeToStreamIfHaveNotYet(streamId) {
        if (!this.streams.isSetUp(streamId)) {
            this.logger.debug('add %s to streams', streamId)
            this.streams.setUpStream(streamId)
            this._sendStreamStatus(streamId)
        }
    }

    unsubscribeFromStream(streamId) {
        this.logger.debug('unsubscribeFromStream: remove %s from streams', streamId)
        this.streams.removeStream(streamId)
        this.instructionThrottler.removeStreamId(streamId)
        this._sendStreamStatus(streamId)
    }

    requestResend(request, source) {
        this.metrics.record('resendRequests', 1)
        this.perStreamMetrics.recordResend(request.streamId)
        this.logger.debug('received %s resend request %s with requestId %s',
            source === null ? 'local' : `from ${source}`,
            request.constructor.name,
            request.requestId)
        this.emit(events.RESEND_REQUEST_RECEIVED, request, source)

        if (this.peerInfo.isStorage()) {
            const { streamId, streamPartition } = request
            this.subscribeToStreamIfHaveNotYet(new StreamIdAndPartition(streamId, streamPartition))
        }

        const requestStream = this.resendHandler.handleRequest(request, source)
        if (source != null) {
            proxyRequestStream(
                async (data) => {
                    try {
                        await this.protocols.nodeToNode.send(source, data)
                    } catch (e) {
                        // TODO: catch specific error
                        const requests = this.resendHandler.cancelResendsOfNode(source)
                        this.logger.warn('Failed to send resend response to %s,\n\tcancelling resends %j,\n\tError %s',
                            source, requests, e)
                    }
                },
                request,
                requestStream
            )
        }
        return requestStream
    }

    onTrackerInstructionReceived(trackerId, instructionMessage) {
        this.instructionThrottler.add(instructionMessage, trackerId)
    }

    async handleTrackerInstruction(instructionMessage, trackerId) {
        const streamId = StreamIdAndPartition.fromMessage(instructionMessage)
        const { nodeIds, counter } = instructionMessage

        // Check that tracker matches expected tracker
        const expectedTrackerId = this._getTrackerId(streamId.key())
        if (trackerId !== expectedTrackerId) {
            this.metrics.record('unexpectedTrackerInstructions', 1)
            this.logger.warn(`Got instructions from unexpected tracker. Expected ${expectedTrackerId}, got from ${trackerId}`)
            return
        }

        this.metrics.record('trackerInstructions', 1)
        this.perStreamMetrics.recordTrackerInstruction(instructionMessage.streamId)
        this.logger.debug('received instructions for %s, nodes to connect %o', streamId, nodeIds)

        this.subscribeToStreamIfHaveNotYet(streamId)
        const currentNodes = this.streams.getAllNodesForStream(streamId)
        const nodesToUnsubscribeFrom = currentNodes.filter((nodeId) => !nodeIds.includes(nodeId))

        const subscribePromises = nodeIds.map(async (nodeId) => {
            await promiseTimeout(this.opts.nodeConnectTimeout, this.protocols.nodeToNode.connectToNode(nodeId, trackerId))
            this._clearDisconnectionTimer(nodeId)
            this._subscribeToStreamOnNode(nodeId, streamId)
            return nodeId
        })

        const unsubscribePromises = nodesToUnsubscribeFrom.map((nodeId) => {
            return this._unsubscribeFromStreamOnNode(nodeId, streamId)
        })
        const results = await Promise.allSettled([
            Promise.allSettled(subscribePromises),
            Promise.allSettled(unsubscribePromises)
        ])
        if (this.streams.isSetUp(streamId)) {
            this.streams.updateCounter(streamId, counter)
        }

        // Log success / failures
        const subscribeNodeIds = []
        const unsubscribeNodeIds = []
        results[0].value.forEach((res) => {
            if (res.status === 'fulfilled') {
                subscribeNodeIds.push(res.value)
            } else {
                this._sendStreamStatus(streamId)
                this.logger.debug(`failed to subscribe (or connect) to node ${res.reason}`)
            }
        })
        results[1].value.forEach((res) => {
            if (res.status === 'fulfilled') {
                unsubscribeNodeIds.push(res.value)
            } else {
                this._sendStreamStatus(streamId)
                this.logger.debug(`failed to unsubscribe to node ${res.reason}`)
            }
        })

        this.logger.debug('subscribed to %j and unsubscribed from %j (streamId=%s, counter=%d)',
            subscribeNodeIds, unsubscribeNodeIds, streamId, counter)

        if (subscribeNodeIds.length !== nodeIds.length) {
            this.logger.debug('error: failed to fulfill all tracker instructions (streamId=%s, counter=%d)',
                streamId, counter)
        }
    }

    onDataReceived(streamMessage, source = null) {
        this.metrics.record('onDataReceived', 1)
        this.perStreamMetrics.recordDataReceived(streamMessage.getStreamId())
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
                this.logger.debug('received from %s data %j with invalid numbering', source, streamMessage.messageId)
                this.metrics.record('onDataReceived:invalidNumber', 1)
                return
            }
            if (e instanceof GapMisMatchError) {
                this.logger.warn(e)
                this.logger.debug('received from %s data %j with gap mismatch detected', source, streamMessage.messageId)
                this.metrics.record('onDataReceived:gapMismatch', 1)
                return
            }
            throw e
        }

        if (isUnseen) {
            this.emit(events.UNSEEN_MESSAGE_RECEIVED, streamMessage, source)
        }
        if (isUnseen || this.seenButNotPropagatedSet.has(streamMessage)) {
            this.logger.debug('received from %s data %j', source, streamMessage.messageId)
            this._propagateMessage(streamMessage, source)
        } else {
            this.logger.debug('ignoring duplicate data %j (from %s)', streamMessage.messageId, source)
            this.metrics.record('onDataReceived:ignoredDuplicate', 1)
            this.perStreamMetrics.recordIgnoredDuplicate(streamMessage.getStreamId())
        }
    }

    _propagateMessage(streamMessage, source) {
        this.metrics.record('propagateMessage', 1)
        this.perStreamMetrics.recordPropagateMessage(streamMessage.getStreamId())
        const streamIdAndPartition = new StreamIdAndPartition(streamMessage.getStreamId(), streamMessage.getStreamPartition())

        const subscribers = this.streams.getOutboundNodesForStream(streamIdAndPartition).filter((n) => n !== source)

        if (subscribers.length) {
            subscribers.forEach((subscriber) => {
                this.protocols.nodeToNode.sendData(subscriber, streamMessage).catch((e) => {
                    this.logger.error(`Failed to _propagateMessage ${streamMessage} to subscriber ${subscriber}, because of ${e}`)
                    this.emit(streamMessage.MESSAGE_PROPAGATION_FAILED, streamMessage, subscriber, e)
                })
            })

            this.seenButNotPropagatedSet.delete(streamMessage)
            this.emit(events.MESSAGE_PROPAGATED, streamMessage)
        } else {
            this.logger.debug('put %j back to buffer because could not propagate to %d nodes or more',
                streamMessage.messageId, MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION)
            this.seenButNotPropagatedSet.add(streamMessage)
            this.messageBuffer.put(streamIdAndPartition.key(), [streamMessage, source])
        }
    }

    stop() {
        this.logger.debug('stopping')
        this.resendHandler.stop()
        this.instructionThrottler.reset()

        if (this.connectToBoostrapTrackersInterval) {
            clearInterval(this.connectToBoostrapTrackersInterval)
            this.connectToBoostrapTrackersInterval = null
        }

        const timeouts = [...this.sendStatusTimeout.values()]
        timeouts.forEach((timeout) => clearTimeout(timeout))

        Object.values(this.disconnectionTimers).forEach((timeout) => clearTimeout(timeout))

        this.messageBuffer.clear()
        return Promise.all([
            this.protocols.trackerNode.stop(),
            this.protocols.nodeToNode.stop(),
        ])
    }

    _getStatus(tracker) {
        return {
            streams: this.streams.getStreamsWithConnections((streamKey) => this._getTrackerId(streamKey) === tracker),
            started: this.started,
            rtts: this.protocols.nodeToNode.getRtts(),
            location: this.peerInfo.location
        }
    }

    _sendStreamStatus(streamId) {
        const trackerId = this._getTrackerId(streamId.key())

        if (trackerId) {
            clearTimeout(this.sendStatusTimeout.get(trackerId))

            const timeout = setTimeout(() => {
                this._sendStatus(trackerId)
            }, this.opts.sendStatusToAllTrackersInterval)

            this.sendStatusTimeout.set(trackerId, timeout)
        }
    }

    async _sendStatus(tracker) {
        const status = this._getStatus(tracker)

        try {
            await this.protocols.trackerNode.sendStatus(tracker, status)
            this.logger.debug('sent status %j to tracker %s', status.streams, tracker)
        } catch (e) {
            this.logger.debug('failed to send status to tracker %s (%s)', tracker, e)
        }
    }

    _subscribeToStreamOnNode(node, streamId) {
        this.streams.addInboundNode(streamId, node)
        this.streams.addOutboundNode(streamId, node)

        this.emit(events.NODE_SUBSCRIBED, {
            streamId,
            node
        })

        return node
    }

    _getTrackerId(streamKey) {
        const address = this.trackerRegistry.getTracker(streamKey)
        return this.trackerBook[address] || null
    }

    _unsubscribeFromStreamOnNode(node, streamId) {
        this.streams.removeNodeFromStream(streamId, node)
        this.logger.debug('node %s unsubscribed from stream %s', node, streamId)
        this.emit(events.NODE_UNSUBSCRIBED, node, streamId)

        if (!this.streams.isNodePresent(node)) {
            this._clearDisconnectionTimer(node)
            this.disconnectionTimers[node] = setTimeout(() => {
                delete this.disconnectionTimers[node]
                if (!this.streams.isNodePresent(node)) {
                    this.logger.debug('no shared streams with node %s, disconnecting', node)
                    this.protocols.nodeToNode.disconnectFromNode(node, disconnectionReasons.NO_SHARED_STREAMS)
                }
            }, this.opts.disconnectionWaitTime)
        }

        this._sendStreamStatus(streamId)
    }

    onNodeDisconnected(node) {
        this.metrics.record('onNodeDisconnect', 1)
        this.resendHandler.cancelResendsOfNode(node)
        this.streams.removeNodeFromAllStreams(node)
        this.logger.debug('removed all subscriptions of node %s', node)
        this.emit(events.NODE_DISCONNECTED, node)
    }

    onTrackerDisconnected(tracker) {
        this.logger.debug('disconnected from tracker %s', tracker)
    }

    _handleBufferedMessages(streamId) {
        this.messageBuffer.popAll(streamId.key())
            .forEach(([streamMessage, source]) => {
                // TODO bad idea to call events directly
                this.onDataReceived(streamMessage, source)
            })
    }

    _connectToBootstrapTrackers() {
        this.trackerRegistry.getAllTrackers().forEach((address) => {
            this.protocols.trackerNode.connectToTracker(address)
                .catch((err) => {
                    this.logger.error('Could not connect to tracker %s because %j', address, err.toString())
                })
        })
    }

    _clearDisconnectionTimer(nodeId) {
        if (this.disconnectionTimers[nodeId] != null) {
            clearTimeout(this.disconnectionTimers[nodeId])
            delete this.disconnectionTimers[nodeId]
        }
    }

    getStreams() {
        return this.streams.getStreamsAsKeys()
    }

    getNeighbors() {
        return this.streams.getAllNodes()
    }
}

Node.events = events

module.exports = Node
