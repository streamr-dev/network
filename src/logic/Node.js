const { EventEmitter } = require('events')

const allSettled = require('promise.allsettled')
const { Utils } = require('streamr-client-protocol')

const getLogger = require('../helpers/logger')
const NodeToNode = require('../protocol/NodeToNode')
const TrackerNode = require('../protocol/TrackerNode')
const MessageBuffer = require('../helpers/MessageBuffer')
const SeenButNotPropagatedSet = require('../helpers/SeenButNotPropagatedSet')
const { disconnectionReasons } = require('../connection/WsEndpoint')
const { StreamIdAndPartition } = require('../identifiers')
const Metrics = require('../metrics')
const ResendHandler = require('../resend/ResendHandler')
const proxyRequestStream = require('../resend/proxyRequestStream')

const { GapMisMatchError, InvalidNumberingError } = require('./DuplicateMessageDetector')
const StreamManager = require('./StreamManager')
const InstructionThrottler = require('./InstructionThrottler')

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

class Node extends EventEmitter {
    constructor(opts) {
        super()

        // set default options
        const defaultOptions = {
            connectToBootstrapTrackersInterval: 5000,
            sendStatusToAllTrackersInterval: 1000,
            bufferTimeoutInMs: 60 * 1000,
            bufferMaxSize: 10000,
            disconnectionWaitTime: 10 * 1000,
            protocols: [],
            resendStrategies: [],
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
        this.resendHandler = new ResendHandler(this.opts.resendStrategies, this.logger.error.bind(this.logger))
        this.trackerRegistry = Utils.createTrackerRegistry(this.opts.trackers)
        this.trackerBook = {} // address => id
        this.started = new Date().toLocaleString()
        this.metrics = new Metrics(this.peerInfo.peerId)
        this.instructionThrottler = new InstructionThrottler(this.handleTrackerInstruction.bind(this))

        this.protocols.trackerNode.on(TrackerNode.events.CONNECTED_TO_TRACKER, (trackerId) => this.onConnectedToTracker(trackerId))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED, (streamMessage, trackerId) => this.onTrackerInstructionReceived(trackerId, streamMessage))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_DISCONNECTED, (trackerId) => this.onTrackerDisconnected(trackerId))
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

    async unsubscribeFromStream(streamId) {
        this.logger.debug('unsubscribeFromStream: remove %s from streams', streamId)
        const nodes = this.streams.removeStream(streamId)
        this.instructionThrottler.removeStreamId(streamId)

        await allSettled(nodes.map((nodeAddress) => this.protocols.nodeToNode.sendUnsubscribe(nodeAddress, streamId))).then((results) => {
            results.forEach((result) => {
                if (result.status !== 'fulfilled') {
                    this.logger.debug(`unsubscribed, but failed to send unsubscribe request for the stream ${streamId}, reason: ${result.reason}`)
                }
            })
        })

        this._sendStreamStatus(streamId)
    }

    requestResend(request, source) {
        this.metrics.inc('requestResend')
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
        const { nodeAddresses, counter } = instructionMessage

        // Check that tracker matches expected tracker
        const expectedTrackerId = this._getTrackerId(streamId.key())
        if (trackerId !== expectedTrackerId) {
            this.metrics.inc('onTrackerInstructionReceived.unexpected_tracker')
            this.logger.warn(`Got instructions from unexpected tracker. Expected ${expectedTrackerId}, got from ${trackerId}`)
            return
        }

        this.metrics.inc('onTrackerInstructionReceived')
        this.logger.debug('received instructions for %s, nodes to connect %o', streamId, nodeAddresses)

        this.subscribeToStreamIfHaveNotYet(streamId)
        const currentNodes = this.streams.getAllNodesForStream(streamId)
        const nodesToUnsubscribeFrom = currentNodes.filter((nodeId) => {
            const address = this.protocols.nodeToNode.endpoint.resolveAddress(nodeId)
            return !nodeAddresses.includes(address)
        })

        const subscribePromises = nodeAddresses.map(async (nodeAddress) => {
            const node = await this.protocols.nodeToNode.connectToNode(nodeAddress)
            this._clearDisconnectionTimer(node)
            await this._subscribeToStreamOnNode(node, streamId)
            return node
        })

        const unsubscribePromises = nodesToUnsubscribeFrom.map((nodeId) => {
            return this._unsubscribeFromStreamOnNode(nodeId, streamId)
        })

        const results = await allSettled([allSettled(subscribePromises), allSettled(unsubscribePromises)])
        this.streams.updateCounter(streamId, counter)

        // Log success / failures
        const subscribeNodeIds = []
        const unsubscribeNodeIds = []
        results[0].value.forEach((res) => {
            if (res.status === 'fulfilled') {
                subscribeNodeIds.push(res.value)
            } else {
                this.logger.debug(`failed to subscribe (or connect) to node ${res.reason}`)
            }
        })
        results[1].value.forEach((res) => {
            if (res.status === 'fulfilled') {
                unsubscribeNodeIds.push(res.value)
            } else {
                this.logger.debug(`failed to unsubscribe to node ${res.reason}`)
            }
        })

        this.logger.debug('subscribed to %j and unsubscribed from %j (streamId=%s, counter=%d)',
            subscribeNodeIds, unsubscribeNodeIds, streamId, counter)

        if (subscribeNodeIds.length !== nodeAddresses.length) {
            this.logger.debug('error: failed to fulfill all tracker instructions (streamId=%s, counter=%d)',
                streamId, counter)
        }
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
                this.logger.debug('received from %s data %j with invalid numbering', source, streamMessage.messageId)
                this.metrics.inc('onDataReceived:ignoring:invalid-numbering')
                return
            }
            if (e instanceof GapMisMatchError) {
                this.logger.warn(e)
                this.logger.debug('received from %s data %j with gap mismatch detected', source, streamMessage.messageId)
                this.metrics.inc('onDataReceived:ignoring:gap-mismatch')
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
            this.metrics.inc('onDataReceived:ignoring:duplicate')
        }
    }

    _propagateMessage(streamMessage, source) {
        this.metrics.inc('_propagateMessage')
        const streamIdAndPartition = new StreamIdAndPartition(streamMessage.getStreamId(), streamMessage.getStreamPartition())

        const subscribers = this.streams.getOutboundNodesForStream(streamIdAndPartition).filter((n) => n !== source)

        if (subscribers.length) {
            subscribers.forEach((subscriber) => {
                this.protocols.nodeToNode.sendData(subscriber, streamMessage).catch((e) => {
                    this.logger.error(`Failed to _propagateMessage ${streamMessage} to subscriber ${subscriber}, because of ${e}`)
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

    onSubscribeRequest(subscribeMessage, source) {
        this.metrics.inc('onSubscribeRequest')
        const streamId = new StreamIdAndPartition(subscribeMessage.streamId, subscribeMessage.streamPartition)
        this.emit(events.SUBSCRIPTION_REQUEST, {
            streamId,
            source
        })

        this.subscribeToStreamIfHaveNotYet(streamId)

        this.streams.addOutboundNode(streamId, source)
        this.streams.addInboundNode(streamId, source)

        this.logger.debug('node %s subscribed to stream %s', source, streamId)
        this.emit(events.NODE_SUBSCRIBED, {
            streamId,
            source
        })
    }

    onUnsubscribeRequest(unsubscribeMessage, source) {
        const streamIdAndPartition = new StreamIdAndPartition(unsubscribeMessage.streamId, unsubscribeMessage.streamPartition)

        if (this.streams.isSetUp(streamIdAndPartition)) {
            this.metrics.inc('onUnsubscribeRequest')
            this.streams.removeNodeFromStream(streamIdAndPartition, source)
            this.logger.debug('node %s unsubscribed from stream %s', source, streamIdAndPartition)
            this.emit(events.NODE_UNSUBSCRIBED, source, streamIdAndPartition)
            this._sendStreamStatus(streamIdAndPartition)
        }
        if (!this.streams.isNodePresent(source)) {
            this.protocols.nodeToNode.disconnectFromNode(source, disconnectionReasons.NO_SHARED_STREAMS)
        }
    }

    stop() {
        this.logger.debug('stopping')
        this.resendHandler.stop()

        const timeouts = [...this.sendStatusTimeout.values()]
        timeouts.forEach((timeout) => clearTimeout(timeout))

        Object.values(this.disconnectionTimers).forEach((timeout) => clearTimeout(timeout))

        this._clearConnectToBootstrapTrackersInterval()
        this.messageBuffer.clear()
        return this.protocols.nodeToNode.stop()
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

    async _subscribeToStreamOnNode(node, streamId) {
        if (!this.streams.hasInboundNode(streamId, node) || !this.streams.hasOutboundNode(streamId, node)) {
            await this.protocols.nodeToNode.sendSubscribe(node, streamId)
        }

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

    async _unsubscribeFromStreamOnNode(node, streamId) {
        this.streams.removeNodeFromStream(streamId, node)

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

        return this.protocols.nodeToNode.sendUnsubscribe(node, streamId)
    }

    onNodeDisconnected(node) {
        this.metrics.inc('onNodeDisconnected')
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

    _clearConnectToBootstrapTrackersInterval() {
        if (this.connectToBoostrapTrackersInterval) {
            clearInterval(this.connectToBoostrapTrackersInterval)
            this.connectToBoostrapTrackersInterval = null
        }
    }

    _clearDisconnectionTimer(nodeId) {
        if (this.disconnectionTimers[nodeId] != null) {
            clearTimeout(this.disconnectionTimers[nodeId])
            delete this.disconnectionTimers[nodeId]
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
            seenButNotPropagated: this.seenButNotPropagatedSet.size()
        }
    }
}

Node.events = events

module.exports = Node
