const { EventEmitter } = require('events')
const createDebug = require('debug')
const NodeToNode = require('../protocol/NodeToNode')
const TrackerNode = require('../protocol/TrackerNode')
const MessageBuffer = require('../helpers/MessageBuffer')
const { disconnectionReasons } = require('../messages/messageTypes')
const StreamManager = require('./StreamManager')

const events = Object.freeze({
    MESSAGE_RECEIVED: 'streamr:node:message-received',
    MESSAGE_PROPAGATED: 'streamr:node:message-propagated',
    NODE_SUBSCRIBED: 'streamr:node:subscribed-successfully',
    SUBSCRIPTION_REQUEST: 'streamr:node:subscription-received',
    MESSAGE_DELIVERY_FAILED: 'streamr:node:message-delivery-failed'
})

const MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION = 1
const TARGET_NUM_OF_INBOUND_NODES_PER_STREAM = 3
const MAX_NUM_NODES_INBOUND_PER_STREAM = 6
const MAX_NUM_NODES_OUTBOUND_PER_STREAM = 6

class Node extends EventEmitter {
    constructor(id, trackerNode, nodeToNode) {
        super()

        this.connectToBoostrapTrackersInterval = setInterval(this._connectToBootstrapTrackers.bind(this), 5000)
        this.maintainStreamsInterval = setInterval(this._maintainStreams.bind(this), 10000)
        this.bootstrapTrackerAddresses = []

        this.streams = new StreamManager()
        this.messageBuffer = new MessageBuffer(60 * 1000, (streamId) => {
            this.debug('failed to deliver buffered messages of stream %s', streamId)
            this.emit(events.MESSAGE_DELIVERY_FAILED, streamId)
        })

        this.id = id
        this.trackers = new Set()

        this.protocols = {
            trackerNode,
            nodeToNode
        }

        this.protocols.trackerNode.on(TrackerNode.events.CONNECTED_TO_TRACKER, (tracker) => this.onConnectedToTracker(tracker))
        this.protocols.trackerNode.on(TrackerNode.events.STREAM_INFO_RECEIVED, (streamMessage) => this.onStreamInfoReceived(streamMessage))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_DISCONNECTED, (tracker) => this.onTrackerDisconnected(tracker))
        this.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, (dataMessage) => this.onDataReceived(dataMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.SUBSCRIBE_REQUEST, (subscribeMessage) => this.onSubscribeRequest(subscribeMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.UNSUBSCRIBE_REQUEST, (unsubscribeMessage) => this.onUnsubscribeRequest(unsubscribeMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))
        this.on(events.NODE_SUBSCRIBED, () => this._sendStatusToAllTrackers())

        this.debug = createDebug(`streamr:logic:node:${this.id}`)
        this.debug('started %s', this.id)

        this.started = new Date().toLocaleString()
        this.metrics = {
            received: {
                duplicates: 0
            }
        }

        this.connectionLimits = {
            maxInBound: MAX_NUM_NODES_INBOUND_PER_STREAM,
            maxOutBound: MAX_NUM_NODES_OUTBOUND_PER_STREAM
        }
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
            this._requestStreamInfo(streamId)
        }
    }

    onStreamInfoReceived(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const nodeAddresses = streamMessage.getNodeAddresses()

        nodeAddresses.forEach(async (nodeAddress) => {
            const node = await this.protocols.nodeToNode.connectToNode(nodeAddress)
            return this._subscribeToStreamOnNode(node, streamId)
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
            if (isUnseen) {
                this.debug('received from %s data %s', dataMessage.getSource(), messageId)
                this._propagateMessage(dataMessage)
            } else {
                this.debug('ignoring duplicate data %s (from %s)', messageId, dataMessage.getSource())
                this.metrics.received.duplicates += 1
            }
        } else {
            this.messageBuffer.put(streamId.key(), dataMessage)
        }
    }

    _isReadyToPropagate(streamId) {
        return this.streams.getOutboundNodesForStream(streamId).length >= MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION
    }

    _propagateMessage(dataMessage) {
        const source = dataMessage.getSource()
        const messageId = dataMessage.getMessageId()
        const previousMessageReference = dataMessage.getPreviousMessageReference()
        const data = dataMessage.getData()
        const { streamId } = messageId

        const subscribers = this.streams.getOutboundNodesForStream(streamId).filter((n) => n !== source)
        subscribers.forEach((subscriber) => {
            this.protocols.nodeToNode.sendData(subscriber, messageId, previousMessageReference, data)
        })
        this.debug('propagated data %s to %j', messageId, subscribers)
        this.emit(events.MESSAGE_PROPAGATED, dataMessage)
    }

    onSubscribeRequest(subscribeMessage) {
        const streamId = subscribeMessage.getStreamId()
        const source = subscribeMessage.getSource()
        const leechOnly = subscribeMessage.getLeechOnly()

        this.emit(events.SUBSCRIPTION_REQUEST, {
            streamId,
            source
        })

        const isSetup = this.streams.isSetUp(streamId)

        if (isSetup && this.streams.getOutboundNodesForStream(streamId).length >= this.connectionLimits.maxOutBound) {
            this.debug('reached max number "%d" for outbound connections for stream %s', this.connectionLimits.maxOutBound, streamId)
            this.protocols.nodeToNode.disconnectFromNode(source, disconnectionReasons.MAX_OUTBOUND_CONNECTIONS)
        } else if (isSetup && !leechOnly && this.streams.getInboundNodesForStream(streamId).length >= this.connectionLimits.maxInBound) {
            this.debug('reached max number "%d" for inbound connections for stream %s', this.connectionLimits.maxInBound, streamId)
            this.protocols.nodeToNode.disconnectFromNode(source, disconnectionReasons.MAX_INBOUND_CONNECTIONS)
        } else {
            this.subscribeToStreamIfHaveNotYet(streamId)

            this.streams.addOutboundNode(streamId, source)

            if (!leechOnly) {
                this.streams.addInboundNode(streamId, source)
            }

            this._handleBufferedMessages(streamId)
            this.debug('node %s subscribed to stream %s', source, streamId)
            this.emit(events.NODE_SUBSCRIBED, {
                streamId,
                source
            })
        }
    }

    onUnsubscribeRequest(unsubscribeMessage) {
        const streamId = unsubscribeMessage.getStreamId()
        const source = unsubscribeMessage.getSource()
        this.streams.removeNodeFromStream(streamId, source)
        this.debug('node %s unsubscribed from stream %s', source, streamId)
    }

    stop(cb) {
        this.debug('stopping')
        this._clearConnectToBootstrapTrackersInterval()
        this._clearMaintainStreamsInterval()
        this.messageBuffer.clear()
        this.protocols.nodeToNode.stop(cb)
    }

    _getStatus() {
        return {
            streams: this.streams.getStreamsWithConnections(),
            started: this.started
        }
    }

    _sendStatusToAllTrackers() {
        this.trackers.forEach((tracker) => this._sendStatus(tracker))
    }

    _sendStatus(tracker) {
        this.protocols.trackerNode.sendStatus(tracker, this._getStatus())
        this.debug('sent status to tracker %s', tracker)
    }

    _requestStreamInfo(streamId) {
        const randomTracker = this._getTracker()

        if (randomTracker) {
            this.protocols.trackerNode.requestStreamInfo(randomTracker, streamId)
        } else {
            console.error('Not connected to any tracker')
        }
    }

    async _subscribeToStreamOnNode(node, streamId) {
        if (!this.streams.hasInboundNode(streamId, node)) {
            await this.protocols.nodeToNode.sendSubscribe(node, streamId, false)

            this.streams.addInboundNode(streamId, node)
            this.streams.addOutboundNode(streamId, node)
            this._handleBufferedMessages(streamId)

            // TODO get prove message from node that we successfully subscribed
            this.emit(events.NODE_SUBSCRIBED, {
                streamId,
                node
            })
        }
    }

    onNodeDisconnected(node) {
        this.streams.removeNodeFromAllStreams(node)
        this.debug('removed all subscriptions of node %s', node)
        this._sendStatusToAllTrackers()
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

    async addBootstrapTracker(trackerAddress) {
        this.bootstrapTrackerAddresses.push(trackerAddress)
        return this.protocols.trackerNode.connectToTracker(trackerAddress)
    }

    _connectToBootstrapTrackers() {
        this.bootstrapTrackerAddresses.forEach((address) => {
            this.protocols.trackerNode.connectToTracker(address)
                .catch((err) => {
                    console.error(`Could not connect to tracker ${address} because '${err}'`)
                })
        })
    }

    _maintainStreams() {
        const streamsRequiringMoreNodes = this.streams.getStreams().filter((streamId) => {
            return this.streams.getInboundNodesForStream(streamId).length < TARGET_NUM_OF_INBOUND_NODES_PER_STREAM
        })

        if (streamsRequiringMoreNodes.length) {
            this.debug('searching for more nodes for streams %j', streamsRequiringMoreNodes)
            streamsRequiringMoreNodes.forEach((streamId) => this._requestStreamInfo(streamId))
        }
    }

    _clearConnectToBootstrapTrackersInterval() {
        if (this.connectToBoostrapTrackersInterval) {
            clearInterval(this.connectToBoostrapTrackersInterval)
            this.connectToBoostrapTrackersInterval = null
        }
    }

    _clearMaintainStreamsInterval() {
        if (this.maintainStreamsInterval) {
            clearInterval(this.maintainStreamsInterval)
            this.maintainStreamsInterval = null
        }
    }

    _getTracker() {
        return this.trackers.size ? [...this.trackers][Math.floor(Math.random() * this.trackers.size)] : null
    }

    setConnectionLimitsPerStream(maxNumNodesInBound = MAX_NUM_NODES_OUTBOUND_PER_STREAM, maxNumNodesOutBound = MAX_NUM_NODES_OUTBOUND_PER_STREAM) {
        this.connectionLimits.maxInBound = maxNumNodesInBound
        this.connectionLimits.maxOutBound = maxNumNodesOutBound
    }

    getConnectionLimitsPerStream() {
        return this.connectionLimits
    }
}

Node.events = events

module.exports = Node
