const { EventEmitter } = require('events')
const createDebug = require('debug')
const TrackerNode = require('../protocol/TrackerNode')
const NodeToNode = require('../protocol/NodeToNode')
const SubscriberManager = require('../logic/SubscriberManager')
const SubscriptionManager = require('../logic/SubscriptionManager')
const MessageBuffer = require('../helpers/MessageBuffer')
const { getAddress, getIdShort } = require('../util')

const events = Object.freeze({
    MESSAGE_RECEIVED: 'streamr:node:message-received',
    MESSAGE_DELIVERY_FAILED: 'streamr:node:message-delivery-failed',
    NO_AVAILABLE_TRACKERS: 'streamr:node:no-trackers',
})

class Node extends EventEmitter {
    constructor(trackerNode, nodeToNode) {
        super()

        this.knownStreams = new Map()
        this.ownStreams = new Set()
        this.subscribers = new SubscriberManager(
            this.subscribeToStream.bind(this),
            this._unsubscribeFromStream.bind(this)
        )
        this.subscriptions = new SubscriptionManager()
        this.messageBuffer = new MessageBuffer(60 * 1000, (streamId) => {
            this.debug('failed to deliver buffered messages of stream %s because leader not found', streamId)
            this.emit(events.MESSAGE_DELIVERY_FAILED, streamId)
        })

        this.id = getIdShort(nodeToNode.endpoint.node.peerInfo) // TODO: better way?
        this.tracker = null

        this.protocols = {
            trackerNode,
            nodeToNode
        }

        this.protocols.trackerNode.on(TrackerNode.events.CONNECTED_TO_TRACKER, (tracker) => this.onConnectedToTracker(tracker))
        this.protocols.trackerNode.on(TrackerNode.events.NODE_LIST_RECEIVED, (nodes) => this.protocols.nodeToNode.connectToNodes(nodes))
        this.protocols.trackerNode.on(TrackerNode.events.STREAM_ASSIGNED, (streamId) => this.addOwnStream(streamId))
        this.protocols.trackerNode.on(TrackerNode.events.STREAM_INFO_RECEIVED, ({ streamId, nodeAddress }) => {
            this.addKnownStreams(streamId, nodeAddress)
        })
        this.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, ({ streamId, data }) => this.onDataReceived(streamId, data))
        this.protocols.nodeToNode.on(NodeToNode.events.SUBSCRIBE_REQUEST, ({ streamId, sender }) => {
            this.onSubscribeRequest(streamId, sender)
        })

        this.protocols.nodeToNode.on(NodeToNode.events.UNSUBSCRIBE_REQUEST, ({ streamId, sender }) => {
            this.onUnsubscribeRequest(streamId, sender)
        })
        this.protocols.nodeToNode.on(TrackerNode.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))

        this.debug = createDebug(`streamr:logic:node:${this.id}`)
        this.debug('started %s', this.id)

        this.started = new Date().toLocaleString()
    }

    onConnectedToTracker(tracker) {
        this.debug('connected to tracker %s', getIdShort(tracker))
        this.tracker = tracker
        this._sendStatus(this.tracker)
        this.debug('requesting more peers from tracker %s', getIdShort(tracker))
        this.protocols.trackerNode.requestMorePeers()
        this._handlePendingSubscriptions()
    }

    addOwnStream(streamId) {
        this.debug('stream %s added to own streams', streamId)
        this.ownStreams.add(streamId)
        this._sendStatus(this.tracker)
        this._handlePossiblePendingSubscription(streamId)
        this._handleBufferedMessages(streamId)
    }

    // add to cache of streams
    addKnownStreams(streamId, nodeAddress) {
        this.debug('stream %s added to known streams for address %s', streamId, nodeAddress)
        this.knownStreams.set(streamId, nodeAddress)
        this._handlePossiblePendingSubscription(streamId)
        this._handleBufferedMessages(streamId)
    }

    onDataReceived(streamId, data) {
        if (this.isOwnStream(streamId)) {
            this.debug('received data for own stream %s', streamId)
            this.emit(events.MESSAGE_RECEIVED, streamId, data)
            this._sendToSubscribers(streamId, data)
        } else if (this._isKnownStream(streamId)) {
            this.debug('received data for known stream %s', streamId)
            const receiverNode = this.knownStreams.get(streamId)
            this.protocols.nodeToNode.sendData(receiverNode, streamId, data) // TODO: only send to leader if not numbered
            this._sendToSubscribers(streamId, data) // TODO: should only send if numbered
        } else if (this.tracker === null) {
            this.debug('no trackers available; attempted to ask about stream %s', streamId)
            this.emit(events.NO_AVAILABLE_TRACKERS)
        } else {
            this.messageBuffer.put(streamId, data)
            this.debug('ask tracker %s who is responsible for stream %s', getIdShort(this.tracker), streamId)
            this.protocols.trackerNode.requestStreamInfo(this.tracker, streamId)
        }
    }

    _sendToSubscribers(streamId, data) {
        const subscribers = this.subscribers.subscribersForStream(streamId)
        this.debug('sending data for streamId %s to %d subscribers', streamId, subscribers.length)
        subscribers.forEach((subscriber) => {
            this.protocols.nodeToNode.sendData(subscriber, streamId, data)
        })
    }

    onSubscribeRequest(streamId, sender) {
        this.subscribers.addSubscriber(streamId, getAddress(sender))
        this.debug('node %s added as a subscriber for the stream %s', getAddress(sender), streamId)
    }

    onUnsubscribeRequest(streamId, nodeAddress) {
        this._removeSubscriber(streamId, nodeAddress)
    }

    _removeSubscriber(streamId, nodeAddress) {
        this.subscribers.removeSubscriber(streamId, nodeAddress)
        this.debug('node %s unsubscribed from the stream %s', nodeAddress, streamId)
    }

    subscribeToStream(streamId) {
        if (this.subscriptions.hasSubscription(streamId)) {
            this.debug('already subscribed to stream %s', streamId)
        } else if (this.isOwnStream(streamId)) {
            this.debug('stream %s is own stream; new subscriber will receive data', streamId)
            this.subscriptions.addSubscription(streamId) // Subscription to "self"
        } else if (this._isKnownStream(streamId)) {
            this.debug('stream %s is in known; sending subscribe request to nodeAddress %s', streamId, this.knownStreams.get(streamId))
            this.protocols.nodeToNode.sendSubscribe(this.knownStreams.get(streamId), streamId)
            this.subscriptions.addSubscription(streamId) // Assuming subscribe went through
        } else if (this.tracker === null) {
            this.debug('no trackers available; attempted to ask about stream %s', streamId)
            this.emit(events.NO_AVAILABLE_TRACKERS)
            this.subscriptions.addPendingSubscription(streamId)
        } else {
            this.debug('unknown stream %s; asking tracker about any info', streamId)
            this.protocols.trackerNode.requestStreamInfo(this.tracker, streamId)
            this.subscriptions.addPendingSubscription(streamId)
        }
    }

    _unsubscribeFromStream(streamId) {
        this.subscriptions.removeSubscription(streamId)
    }

    isOwnStream(streamId) {
        return this.ownStreams.has(streamId)
    }

    _isKnownStream(streamId) {
        return this.knownStreams.get(streamId) !== undefined
    }

    stop(cb) {
        this.debug('stopping')
        this.messageBuffer.clear()
        this.protocols.trackerNode.stop(cb)
        this.protocols.nodeToNode.stop(cb)
    }

    _getStatus() {
        return {
            streams: [...this.ownStreams],
            started: this.started
        }
    }

    _sendStatus(tracker) {
        this.debug('sending status to tracker %s', getIdShort(tracker))
        if (tracker) {
            this.protocols.trackerNode.sendStatus(tracker, this._getStatus())
        }
    }

    onNodeDisconnected(node) {
        this.nodes.delete(getAddress(node))
        const nodeAddress = getAddress(node)
        this.subscribers.removeSubscriberFromAllStreams(nodeAddress)
        this.debug('removed node %s from all subscriptions', getIdShort(node))
    }

    _handleBufferedMessages(streamId) {
        this.messageBuffer.popAll(streamId)
            .forEach((data) => this.onDataReceived(streamId, data))
    }

    _handlePendingSubscriptions() {
        this.subscriptions.getPendingSubscriptions().forEach((pendingStreamId) => {
            this.subscribeToStream(pendingStreamId)
        })
    }

    _handlePossiblePendingSubscription(pendingStreamId) {
        if (this.subscriptions.hasPendingSubscription(pendingStreamId)) {
            this.subscribeToStream(pendingStreamId)
        }
    }
}

Node.events = events

module.exports = Node
