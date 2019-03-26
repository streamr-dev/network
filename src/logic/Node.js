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
    NODE_UNSUBSCRIBED: 'streamr:node:node-unsubscribed',
    SUBSCRIPTION_REQUEST: 'streamr:node:subscription-received',
    MESSAGE_DELIVERY_FAILED: 'streamr:node:message-delivery-failed'
})

const MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION = 1

class Node extends EventEmitter {
    constructor(id, trackerNode, nodeToNode) {
        super()

        this.connectToBoostrapTrackersInterval = setInterval(this._connectToBootstrapTrackers.bind(this), 5000)
        this.sendStatusTimeout = null
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
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED, (streamMessage) => this.onTrackerInstructionReceived(streamMessage))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_DISCONNECTED, (tracker) => this.onTrackerDisconnected(tracker))
        this.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, (dataMessage) => this.onDataReceived(dataMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.SUBSCRIBE_REQUEST, (subscribeMessage) => this.onSubscribeRequest(subscribeMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.UNSUBSCRIBE_REQUEST, (unsubscribeMessage) => this.onUnsubscribeRequest(unsubscribeMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))
        this.on(events.NODE_SUBSCRIBED, ({ streamId }) => {
            this._handleBufferedMessages(streamId)
            this._sendStatusToAllTrackers()
        })

        this.debug = createDebug(`streamr:logic:node:${this.id}`)
        this.debug('started %s', this.id)

        this.started = new Date().toLocaleString()
        this.metrics = {
            received: {
                duplicates: 0
            }
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
        }
    }

    unsubscribeFromStream(streamId) {
        this.debug('remove %s from streams', streamId)
        const nodes = this.streams.removeStream(streamId)
        nodes.forEach((n) => this.protocols.nodeToNode.sendUnsubscribe(n, streamId))
        this._sendStatusToAllTrackers()
    }

    async onTrackerInstructionReceived(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const nodeAddresses = streamMessage.getNodeAddresses()
        const nodeIds = []

        this.debug('received instructions for %s', streamId)

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

        this.debug('connected and subscribed to %j for stream %s', nodeIds, streamId)

        const currentNodes = this.streams.getAllNodes()
        const nodesToDisconnect = currentNodes.filter((node) => !nodeIds.includes(node))

        nodesToDisconnect.forEach(async (node) => {
            await this.protocols.nodeToNode.disconnectFromNode(node, disconnectionReasons.TRACKER_INSTRUCTION)
            this.debug('disconnected from node %s (tracker instruction)', node)
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
        this.debug('propagated data %s to %j', messageId, successfulSends)
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
    }

    onUnsubscribeRequest(unsubscribeMessage) {
        const streamId = unsubscribeMessage.getStreamId()
        const source = unsubscribeMessage.getSource()
        this.streams.removeNodeFromStream(streamId, source)
        this.debug('node %s unsubscribed from stream %s', source, streamId)
        this.emit(events.NODE_UNSUBSCRIBED, source, streamId)
        this._sendStatusToAllTrackers()
    }

    stop(cb) {
        this.debug('stopping')
        this._clearConnectToBootstrapTrackersInterval()
        this._disconnectFromAllNodes()
        this._disconnectFromTrackers()
        this.messageBuffer.clear()
        this.protocols.nodeToNode.stop(cb)
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
        }, 1000)
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

    addBootstrapTracker(trackerAddress) {
        this.bootstrapTrackerAddresses.push(trackerAddress)
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
