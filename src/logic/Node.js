const { EventEmitter } = require('events')
const createDebug = require('debug')
const NodeToNode = require('../protocol/NodeToNode')
const TrackerNode = require('../protocol/TrackerNode')
const MessageBuffer = require('../helpers/MessageBuffer')
const { disconnectionReasons } = require('../messages/messageTypes')
const StreamManager = require('./StreamManager')
const ResendHandler = require('./ResendHandler')

const events = Object.freeze({
    MESSAGE_RECEIVED: 'streamr:node:message-received',
    MESSAGE_PROPAGATED: 'streamr:node:message-propagated',
    NODE_SUBSCRIBED: 'streamr:node:subscribed-successfully',
    NODE_UNSUBSCRIBED: 'streamr:node:node-unsubscribed',
    NODE_DISCONNECTED: 'streamr:node:node-disconnected',
    SUBSCRIPTION_REQUEST: 'streamr:node:subscription-received',
    MESSAGE_DELIVERY_FAILED: 'streamr:node:message-delivery-failed',
    UNICAST_RECEIVED: 'streamr:node:unicast-received',
    RESEND_RESPONSE_RECEIVED: 'streamr:node:resend-response-received',

})

const MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION = 1

class Node extends EventEmitter {
    constructor(opts) {
        super()

        // set default options
        const defaultOptions = {
            id: 'node',
            connectToBootstrapTrackersInterval: 5000,
            sendStatusToAllTrackersInterval: 1000,
            messageBufferSize: 60 * 1000,
            protocols: [],
            resendStrategies: []
        }

        this.opts = Object.assign({}, defaultOptions, opts)

        if (!(this.opts.protocols.trackerNode instanceof TrackerNode) || !(this.opts.protocols.nodeToNode instanceof NodeToNode)) {
            throw new Error('Provided protocols are not correct')
        }

        this.connectToBoostrapTrackersInterval = setInterval(this._connectToBootstrapTrackers.bind(this), this.opts.connectToBootstrapTrackersInterval)
        this.sendStatusTimeout = null
        this.bootstrapTrackerAddresses = []

        this.streams = new StreamManager()
        this.messageBuffer = new MessageBuffer(this.opts.messageBufferSize, (streamId) => {
            this.debug('failed to deliver buffered messages of stream %s', streamId)
            this.emit(events.MESSAGE_DELIVERY_FAILED, streamId)
        })
        this.resendHandler = new ResendHandler(this.opts.resendStrategies,
            this.respondResend.bind(this),
            this._unicast.bind(this),
            console.error.bind(console))

        this.trackers = new Set()

        this.protocols = this.opts.protocols

        this.protocols.trackerNode.on(TrackerNode.events.CONNECTED_TO_TRACKER, (tracker) => this.onConnectedToTracker(tracker))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED, (streamMessage) => this.onTrackerInstructionReceived(streamMessage))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_DISCONNECTED, (tracker) => this.onTrackerDisconnected(tracker))
        this.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, (dataMessage) => this.onDataReceived(dataMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.SUBSCRIBE_REQUEST, (subscribeMessage) => this.onSubscribeRequest(subscribeMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.UNSUBSCRIBE_REQUEST, (unsubscribeMessage) => this.onUnsubscribeRequest(unsubscribeMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))
        this.protocols.nodeToNode.on(NodeToNode.events.RESEND_REQUEST, (request) => this.requestResend(request))
        this.on(events.NODE_SUBSCRIBED, ({ streamId }) => {
            this._handleBufferedMessages(streamId)
            this._sendStatusToAllTrackers()
        })

        this.debug = createDebug(`streamr:logic:node:${this.opts.id}`)
        this.debug('started %s', this.opts.id)

        this.started = new Date().toLocaleString()
        this.metrics = {
            received: {
                duplicates: 0
            }
        }

        this.seenButNotPropagated = new Set()
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
        this.debug('remove %s from streams', streamId)
        const nodes = this.streams.removeStream(streamId)
        nodes.forEach((n) => this.protocols.nodeToNode.sendUnsubscribe(n, streamId))
        this._sendStatusToAllTrackers()
    }

    requestResend(request) {
        this.debug('received %s resend request %s with subId %s',
            request.getSource() === null ? 'local' : `from ${request.getSource()}`,
            request.constructor.name,
            request.getSubId())
        return this.resendHandler.handleRequest(request)
    }

    async respondResend(destination, response) {
        if (destination === null) {
            this.emit(events.RESEND_RESPONSE_RECEIVED, response)
        } else {
            await this.protocols.nodeToNode.send(destination, response)
        }

        this.debug('responded %s with %s and subId %s',
            destination === null ? 'locally' : `to ${destination}`,
            response.constructor.name,
            response.getSubId())
    }

    async _unicast(destination, unicastMessage) {
        if (destination === null) {
            this.emit(events.UNICAST_RECEIVED, unicastMessage)
        } else {
            await this.protocols.nodeToNode.send(destination, unicastMessage)
        }
        this.debug('sent %s unicast %s for subId %s',
            destination === null ? 'locally' : `to ${destination}`,
            unicastMessage.getMessageId(),
            unicastMessage.getSubId())
    }

    async onTrackerInstructionReceived(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const nodeAddresses = streamMessage.getNodeAddresses()
        const nodeIds = []

        this.debug('received instructions for %s', streamId)
        this.subscribeToStreamIfHaveNotYet(streamId)

        await Promise.all(nodeAddresses.map(async (nodeAddress) => {
            let node
            try {
                node = await this.protocols.nodeToNode.connectToNode(nodeAddress)
            } catch (e) {
                this.debug('failed to connect to node at %s (%s)', nodeAddress, e)
                return
            }
            try {
                await this._subscribeToStreamOnNode(node, streamId)
            } catch (e) {
                this.debug('failed to subscribe to node %s (%s)', node, e)
                return
            }
            nodeIds.push(node)
        }))

        const currentNodes = this.streams.getAllNodesForStream(streamId)
        const nodesToUnsubscribeFrom = currentNodes.filter((node) => !nodeIds.includes(node))

        nodesToUnsubscribeFrom.forEach((node) => {
            this._unsubscribeFromStreamOnNode(node, streamId)
        })
    }

    onDataReceived(dataMessage) {
        const messageId = dataMessage.getMessageId()
        const previousMessageReference = dataMessage.getPreviousMessageReference()
        const { streamId } = messageId

        this.emit(events.MESSAGE_RECEIVED, dataMessage)

        this.subscribeToStreamIfHaveNotYet(streamId)

        if (this._isReadyToPropagate(streamId)) {
            const isUnseen = this.streams.markNumbersAndCheckThatIsNotDuplicate(messageId, previousMessageReference)
            if (isUnseen || this.seenButNotPropagated.has(messageId)) {
                this.debug('received from %s data %s', dataMessage.getSource(), messageId)
                this._propagateMessage(dataMessage)
            } else {
                this.debug('ignoring duplicate data %s (from %s)', messageId, dataMessage.getSource())
                this.metrics.received.duplicates += 1
            }
        } else {
            this.debug('Not outbound nodes to propagate')
            this.messageBuffer.put(streamId.key(), dataMessage)
        }
    }

    _isReadyToPropagate(streamId) {
        return this.streams.getOutboundNodesForStream(streamId).length >= MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION
    }

    async _propagateMessage(dataMessage) {
        const source = dataMessage.getSource()
        const messageId = dataMessage.getMessageId()
        const previousMessageReference = dataMessage.getPreviousMessageReference()
        const data = dataMessage.getData()
        const signature = dataMessage.getSignature()
        const signatureType = dataMessage.getSignatureType()
        const { streamId } = messageId

        const subscribers = this.streams.getOutboundNodesForStream(streamId).filter((n) => n !== source)
        const successfulSends = []
        await Promise.all(subscribers.map(async (subscriber) => {
            try {
                await this.protocols.nodeToNode.sendData(subscriber, messageId, previousMessageReference, data, signature, signatureType)
                successfulSends.push(subscriber)
            } catch (e) {
                this.debug('failed to propagate data %s to node %s (%s)', messageId, subscriber, e)
            }
        }))
        if (successfulSends.length >= Math.min(MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION, subscribers.length)) {
            this.debug('propagated data %s to %j', messageId, successfulSends)
            this.seenButNotPropagated.delete(messageId)
            this.emit(events.MESSAGE_PROPAGATED, dataMessage)
        } else {
            // Handle scenario in which we were unable to propagate message to enough nodes. This often happens when
            // socket.readyState=2 (closing)
            this.debug('put %s back to buffer because could not propagated %d nodes or more',
                messageId, MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION)
            this.seenButNotPropagated.add(messageId)
            this.messageBuffer.put(streamId.key(), dataMessage)
        }
    }

    onSubscribeRequest(subscribeMessage) {
        const streamId = subscribeMessage.getStreamId()
        const source = subscribeMessage.getSource()
        const leechOnly = subscribeMessage.getLeechOnly()

        this.emit(events.SUBSCRIPTION_REQUEST, {
            streamId,
            source
        })

        if (this.streams.isSetUp(streamId)) {
            this.subscribeToStreamIfHaveNotYet(streamId)

            this.streams.addOutboundNode(streamId, source)
            if (!leechOnly) {
                this.streams.addInboundNode(streamId, source)
            }

            this.debug('node %s subscribed to stream %s', source, streamId)
            this.emit(events.NODE_SUBSCRIBED, {
                streamId,
                source
            })
        } else {
            this.debug('node %s tried to subscribe to stream %s, but it is not setup', source, streamId)
            this.protocols.nodeToNode.sendUnsubscribe(source, streamId)
        }
    }

    onUnsubscribeRequest(unsubscribeMessage) {
        const streamId = unsubscribeMessage.getStreamId()
        const source = unsubscribeMessage.getSource()
        this.streams.removeNodeFromStream(streamId, source)
        this.debug('node %s unsubscribed from stream %s', source, streamId)
        this.emit(events.NODE_UNSUBSCRIBED, source, streamId)
        this._sendStatusToAllTrackers()
        if (!this.streams.isNodePresent(source)) {
            this.protocols.nodeToNode.disconnectFromNode(source, disconnectionReasons.NO_SHARED_STREAMS)
        }
    }

    stop(cb) {
        this.debug('stopping')
        this.resendHandler.stop()
        this._clearConnectToBootstrapTrackersInterval()
        this._disconnectFromAllNodes()
        this._disconnectFromTrackers()
        this.messageBuffer.clear()
        return this.protocols.nodeToNode.stop(cb)
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

    async _subscribeToStreamOnNode(node, streamId) {
        if (!this.streams.hasInboundNode(streamId, node)) {
            await this.protocols.nodeToNode.sendSubscribe(node, streamId, false)

            this.streams.addInboundNode(streamId, node)
            this.streams.addOutboundNode(streamId, node)

            // TODO get prove message from node that we successfully subscribed
            this.emit(events.NODE_SUBSCRIBED, {
                streamId,
                node
            })
        }
    }

    async _unsubscribeFromStreamOnNode(node, streamId) {
        this.streams.removeNodeFromStream(streamId, node)
        await this.protocols.nodeToNode.sendUnsubscribe(node, streamId)
        this.debug('unsubscribed from node %s (tracker instruction)', node)
    }

    onNodeDisconnected(node) {
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
            .forEach((dataMessage) => {
                // TODO bad idea to call events directly
                this.onDataReceived(dataMessage)
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
                    console.error(`Could not connect to tracker ${address} because '${err}'`)
                })
        })
    }

    _clearConnectToBootstrapTrackersInterval() {
        if (this.connectToBoostrapTrackersInterval) {
            clearInterval(this.connectToBoostrapTrackersInterval)
            this.connectToBoostrapTrackersInterval = null
        }
    }
}

Node.events = events

module.exports = Node
