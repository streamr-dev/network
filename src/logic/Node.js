const { EventEmitter } = require('events')
const createDebug = require('debug')
const NodeToNode = require('../protocol/NodeToNode')
const TrackerNode = require('../protocol/TrackerNode')
const SubscriberManager = require('../logic/SubscriberManager')
const SubscriptionManager = require('../logic/SubscriptionManager')
const MessageBuffer = require('../helpers/MessageBuffer')
const DataMessage = require('../messages/DataMessage')
const StreamManager = require('./StreamManager')

const events = Object.freeze({
    MESSAGE_RECEIVED: 'streamr:node:message-received',
    MESSAGE_DELIVERY_FAILED: 'streamr:node:message-delivery-failed',
    NO_AVAILABLE_TRACKERS: 'streamr:node:no-trackers',
    SUBSCRIBED_TO_STREAM: 'streamr:node:subscribed-to-stream'
})

class Node extends EventEmitter {
    constructor(id, peerBook, trackerNode, nodeToNode) {
        super()

        this.trackerDiscoveryInterval = null
        this.bootstrapTrackers = []

        this.streams = new StreamManager()
        this.subscribers = new SubscriberManager(
            this.subscribeToStream.bind(this),
            this._unsubscribeFromStream.bind(this)
        )
        this.subscriptions = new SubscriptionManager()
        this.messageBuffer = new MessageBuffer(60 * 1000, (streamId) => {
            this.debug('failed to deliver buffered messages of stream %s because responsible nodes not found', streamId)
            this.emit(events.MESSAGE_DELIVERY_FAILED, streamId)
        })

        this.id = id
        this.peerBook = peerBook
        this.trackers = new Map()

        this.protocols = {
            trackerNode,
            nodeToNode
        }

        this.protocols.trackerNode.on(TrackerNode.events.CONNECTED_TO_TRACKER, (tracker) => this.onConnectedToTracker(tracker))
        this.protocols.trackerNode.on(TrackerNode.events.STREAM_ASSIGNED, (streamId) => this.addOwnStream(streamId))
        this.protocols.trackerNode.on(TrackerNode.events.STREAM_INFO_RECEIVED, (streamMessage) => this.addKnownStream(streamMessage))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_DISCONNECTED, (tracker) => this.onTrackerDisconnected(tracker))
        this.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, (dataMessage) => this.onDataReceived(dataMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.SUBSCRIBE_REQUEST, (subscribeMessage) => this.onSubscribeRequest(subscribeMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.UNSUBSCRIBE_REQUEST, (unsubscribeMessage) => this.onUnsubscribeRequest(unsubscribeMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))

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
        if (this._isTracker(tracker)) {
            this.debug('connected to tracker %s', this.peerBook.getShortId(tracker))
            this.trackers.set(tracker, tracker)
            this._sendStatus(tracker)
            this._handlePendingSubscriptions()
        }
    }

    addOwnStream(streamId) {
        this.debug('add %s to own streams', streamId)
        this.streams.markOwnStream(streamId)
        this._sendStatusToAllTrackers()
        this._handlePossiblePendingSubscription(streamId)
        this._handleBufferedMessages(streamId)
    }

    async addKnownStream(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const nodeAddresses = streamMessage.getNodeAddresses()

        await this.protocols.nodeToNode.connectToNodes(nodeAddresses)
        this.streams.markKnownStream(streamId, nodeAddresses)
        this.debug('known stream %s nodes set to %j', streamId, nodeAddresses.map((a) => this.peerBook.getShortId(a)))

        this._handlePossiblePendingSubscription(streamId)
        this._handleBufferedMessages(streamId)
    }

    onDataReceived(dataMessage) {
        const streamId = dataMessage.getStreamId()
        const data = dataMessage.getData()
        const number = dataMessage.getNumber()
        const previousNumber = dataMessage.getPreviousNumber()
        const tracker = this._getTracker()

        if (this.streams.isOwnStream(streamId)) {
            this.debug('received data for own stream %s', streamId)
            const isUnseen = this.streams.markNumbersAndCheckThatIsNotDuplicate(streamId, number, previousNumber)
            if (isUnseen) {
                this._sendToSubscribers(dataMessage)
            } else {
                this.metrics.received.duplicates += 1
                this.debug('ignoring duplicate data (#%s) for stream %s', number, streamId)
            }
        } else if (this.streams.isKnownStream(streamId)) {
            this.debug('received data for other node\'s stream %s', streamId)
            const otherNodeAddress = this.streams.getNodesForKnownStream(streamId)[0] // TODO: randomization or what?
            this.protocols.nodeToNode.sendData(otherNodeAddress, streamId, data, number, previousNumber)
            this._sendToSubscribers(dataMessage) // TODO: remove or what?
        } else if (tracker === null) {
            this.debug('no trackers available; received data for stream %s', streamId)
            this.emit(events.NO_AVAILABLE_TRACKERS)
        } else {
            // TODO store data object?
            this.messageBuffer.put(streamId, {
                data,
                number,
                previousNumber
            })
            this.debug('ask tracker %s who is responsible for stream %s', this.peerBook.getShortId(tracker), streamId)
            this.protocols.trackerNode.requestStreamInfo(tracker, streamId)
        }
    }

    _sendToSubscribers(dataMessage) {
        const streamId = dataMessage.getStreamId()
        const data = dataMessage.getData()
        const number = dataMessage.getNumber()
        const previousNumber = dataMessage.getPreviousNumber()

        const subscribers = this.subscribers.subscribersForStream(streamId)
        this.debug('sending data (#%s) for stream %s to %d subscribers', number, streamId, subscribers.length)
        subscribers.forEach((subscriber) => {
            this.protocols.nodeToNode.sendData(subscriber, streamId, data, number, previousNumber)
        })
        if (this.subscriptions.hasSubscription(streamId)) {
            this.emit(events.MESSAGE_RECEIVED, dataMessage)
        }
    }

    onSubscribeRequest(subscribeMessage) {
        this.subscribers.addSubscriber(subscribeMessage.getStreamId(), subscribeMessage.getSource())
        this.debug('node %s added as a subscriber for stream %s',
            this.peerBook.getShortId(subscribeMessage.getSource()),
            subscribeMessage.getStreamId())
    }

    onUnsubscribeRequest(unsubscribeMessage) {
        this._removeSubscriber(unsubscribeMessage.getStreamId(), unsubscribeMessage.getSender())
    }

    _removeSubscriber(streamId, nodeAddress) {
        this.subscribers.removeSubscriber(streamId, nodeAddress)
        this.debug('node %s unsubscribed from stream %s', nodeAddress, streamId)
    }

    subscribeToStream(streamId) {
        const tracker = this._getTracker()

        if (this.subscriptions.hasSubscription(streamId)) {
            this.debug('already subscribed to stream %s', streamId)
            this.emit(events.SUBSCRIBED_TO_STREAM, streamId)
        } else if (this.streams.isOwnStream(streamId)) {
            this.debug('stream %s is own stream; new subscriber will receive data', streamId)
            this.subscriptions.addSubscription(streamId) // Subscription to "self"
            this._sendStatusToAllTrackers()
            this.emit(events.SUBSCRIBED_TO_STREAM, streamId)
        } else if (this.streams.isKnownStream(streamId)) {
            const otherNodeAddresses = this.streams.getNodesForKnownStream(streamId)
            this.debug('stream %s is known; sending subscribe requests to responsible nodes %j',
                streamId, otherNodeAddresses.map((a) => this.peerBook.getShortId(a)))
            otherNodeAddresses.forEach((address) => {
                this.protocols.nodeToNode.sendSubscribe(address, streamId)
            })
            this.subscriptions.addSubscription(streamId) // Assuming subscribes went through
            this._sendStatusToAllTrackers()
            this.emit(events.SUBSCRIBED_TO_STREAM, streamId)
        } else if (tracker === null) {
            this.debug('no trackers available; attempted to subscribe to stream %s', streamId)
            this.emit(events.NO_AVAILABLE_TRACKERS)
            this.subscriptions.addPendingSubscription(streamId)
        } else {
            this.debug('unknown stream %s; asking tracker about any info', streamId)
            this.protocols.trackerNode.requestStreamInfo(tracker, streamId)
            this.subscriptions.addPendingSubscription(streamId)
        }
    }

    _unsubscribeFromStream(streamId) {
        this.subscriptions.removeSubscription(streamId)
    }

    stop(cb) {
        this.debug('stopping')
        this._clearTrackerDiscoveryInterval()
        this.messageBuffer.clear()
        this.protocols.nodeToNode.stop(cb)
    }

    _getStatus() {
        return {
            ownStreams: this.streams.getOwnStreams(),
            started: this.started
        }
    }

    _sendStatusToAllTrackers() {
        this.trackers.forEach((tracker, _) => this._sendStatus(tracker))
    }

    _sendStatus(tracker) {
        this.debug('sending status to tracker %s', this.peerBook.getShortId(tracker))
        this.protocols.trackerNode.sendStatus(tracker, this._getStatus())
    }

    onNodeDisconnected(node) {
        if (this._isNode(node)) {
            const nodeAddress = node
            this.subscribers.removeSubscriberFromAllStreams(nodeAddress)
            this.debug('removed all subscriptions of node %s', this.peerBook.getShortId(node))
        }
    }

    onTrackerDisconnected(tracker) {
        if (this._isTracker(tracker)) {
            this.trackers.delete(tracker)
        }
    }

    _handleBufferedMessages(streamId) {
        this.messageBuffer.popAll(streamId)
            .forEach((content) => {
                const dataMessage = new DataMessage(streamId, content.data, content.number, content.previousNumber)
                // TODO bad idea to call events directly
                this.onDataReceived(dataMessage)
            })
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

    setBootstrapTrackers(bootstrapTrackers) {
        // TODO validate ws path
        this.bootstrapTrackers = bootstrapTrackers

        const discoverTrackers = () => {
            this.bootstrapTrackers.forEach((tracker) => {
                this.protocols.trackerNode.connectToTracker(tracker)
                    .catch((err) => {
                        console.error(`Could not connect to tracker ${tracker} because '${err}'`)
                    })
            })
        }

        discoverTrackers()
        this.trackerDiscoveryInterval = setInterval(discoverTrackers, 5000)
    }

    _clearTrackerDiscoveryInterval() {
        if (this.trackerDiscoveryInterval) {
            clearInterval(this.trackerDiscoveryInterval)
            this.trackerDiscoveryInterval = null
        }
    }

    _getTracker() {
        return this.trackers.get([...this.trackers.keys()][Math.floor(Math.random() * this.trackers.size)])
    }

    _isTracker(tracker) {
        return this.bootstrapTrackers.includes(tracker)
    }

    _isNode(peer) {
        return !this._isTracker(peer)
    }
}

Node.events = events

module.exports = Node
