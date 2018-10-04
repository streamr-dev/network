const { EventEmitter } = require('events')
const createDebug = require('debug')
const NodeToNode = require('../protocol/NodeToNode')
const TrackerNode = require('../protocol/TrackerNode')
const SubscriberManager = require('../logic/SubscriberManager')
const SubscriptionManager = require('../logic/SubscriptionManager')
const MessageBuffer = require('../helpers/MessageBuffer')
const DataMessage = require('../messages/DataMessage')
const { getAddress, getIdShort } = require('../util')
const StreamManager = require('./StreamManager')

const events = Object.freeze({
    MESSAGE_RECEIVED: 'streamr:node:message-received',
    MESSAGE_DELIVERY_FAILED: 'streamr:node:message-delivery-failed',
    NO_AVAILABLE_TRACKERS: 'streamr:node:no-trackers',
    SUBSCRIBED_TO_STREAM: 'streamr:node:subscribed-to-stream'
})

class Node extends EventEmitter {
    constructor(trackerNode, nodeToNode) {
        super()

        this.streams = new StreamManager()
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
        this.protocols.trackerNode.on(TrackerNode.events.NODE_LIST_RECEIVED, (peersMessage) => this.protocols.nodeToNode.connectToNodes(peersMessage))
        this.protocols.trackerNode.on(TrackerNode.events.STREAM_ASSIGNED, (streamId) => this.addOwnStream(streamId))
        this.protocols.trackerNode.on(TrackerNode.events.STREAM_INFO_RECEIVED, (streamMessage) => this.addKnownStreams(streamMessage))
        this.protocols.trackerNode.on(TrackerNode.events.TRACKER_DISCONNECTED, () => this.onTrackerDisconnected())
        this.protocols.nodeToNode.on(NodeToNode.events.DATA_RECEIVED, (dataMessage) => this.onDataReceived(dataMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.SUBSCRIBE_REQUEST, (subscribeMessage) => this.onSubscribeRequest(subscribeMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.UNSUBSCRIBE_REQUEST, (unsubscribeMessage) => this.onUnsubscribeRequest(unsubscribeMessage))
        this.protocols.nodeToNode.on(NodeToNode.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))

        this.debug = createDebug(`streamr:logic:node:${this.id}`)
        this.debug('started %s', this.id)

        this.started = new Date().toLocaleString()
    }

    onConnectedToTracker(tracker) {
        this.debug('connected to tracker %s', getIdShort(tracker))
        this.tracker = tracker
        this._sendStatus()
        this.debug('requesting more peers from tracker %s', getIdShort(tracker))
        this.protocols.trackerNode.requestMorePeers()
        this._handlePendingSubscriptions()
    }

    addOwnStream(streamId) {
        this.debug('set self as leader of stream %s', streamId)
        this.streams.markCurrentNodeAsLeaderOf(streamId)
        this._sendStatus()
        this._handlePossiblePendingSubscription(streamId)
        this._handleBufferedMessages(streamId)
    }

    addKnownStreams(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const leaderAddress = streamMessage.getLeaderAddress()
        const repeaterAddresses = streamMessage.getRepeaterAddresses()

        this.streams.markOtherNodeAsLeader(streamId, leaderAddress)
        this.debug('stream %s leader set to %s', streamId, getIdShort(leaderAddress))
        this.streams.markRepeaterNodes(streamId, repeaterAddresses)
        this.debug('stream %s repeater nodes set to %j', streamId, repeaterAddresses.map((a) => getIdShort(a)))

        this._handlePossiblePendingSubscription(streamId)
        this._handleBufferedMessages(streamId)
    }

    onDataReceived(dataMessage) {
        const streamId = dataMessage.getStreamId()
        const data = dataMessage.getData()
        const number = dataMessage.getNumber()
        const previousNumber = dataMessage.getPreviousNumber()

        if (number == null && previousNumber != null) {
            this.debug('received invalid data with null number but non-null previous number %s; dropping', previousNumber)
        } else if (this.streams.isLeaderOf(streamId)) {
            if (number != null) {
                this.debug('received already numbered data (#%s) for own stream %s; dropping', number, streamId)
            } else {
                this.debug('received data for own stream %s', streamId)
                const assignment = this.streams.fetchNextNumbers(streamId)
                dataMessage.setNumber(assignment.number)
                dataMessage.setPreviousNumber(assignment.previousNumber)
                this._sendToSubscribers(dataMessage)
            }
        } else if (this.streams.isOtherNodeLeaderOf(streamId)) {
            this.debug('received data (#%s) for known stream %s', number, streamId)
            if (number == null) {
                const leaderAddress = this.streams.getLeaderAddressFor(streamId)
                this.protocols.nodeToNode.sendData(leaderAddress, streamId, data, number, previousNumber)
            } else {
                this._sendToSubscribers(dataMessage)
            }
        } else if (this.tracker === null) {
            this.debug('no trackers available; attempted to ask about stream %s', streamId)
            this.emit(events.NO_AVAILABLE_TRACKERS)
        } else {
            // TODO store data object?
            this.messageBuffer.put(streamId, {
                data,
                number,
                previousNumber
            })
            this.debug('ask tracker %s who is responsible for stream %s', getIdShort(this.tracker), streamId)
            this.protocols.trackerNode.requestStreamInfo(this.tracker, streamId)
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
        this.subscribers.addSubscriber(subscribeMessage.getStreamId(), getAddress(subscribeMessage.getSource()))
        this.debug('node %s added as a subscriber for stream %s',
            getIdShort(subscribeMessage.getSource()), subscribeMessage.getStreamId())
    }

    onUnsubscribeRequest(unsubscribeMessage) {
        this._removeSubscriber(unsubscribeMessage.getStreamId(), unsubscribeMessage.getSender())
    }

    _removeSubscriber(streamId, nodeAddress) {
        this.subscribers.removeSubscriber(streamId, nodeAddress)
        this.debug('node %s unsubscribed from stream %s', nodeAddress, streamId)
    }

    subscribeToStream(streamId) {
        if (this.subscriptions.hasSubscription(streamId)) {
            this.debug('already subscribed to stream %s', streamId)
            this.emit(events.SUBSCRIBED_TO_STREAM, streamId)
        } else if (this.streams.isLeaderOf(streamId)) {
            this.debug('stream %s is own stream; new subscriber will receive data', streamId)
            this.subscriptions.addSubscription(streamId) // Subscription to "self"
            this._sendStatus()
            this.emit(events.SUBSCRIBED_TO_STREAM, streamId)
        } else if (this.streams.isAnyRepeaterKnownFor(streamId)) {
            const repeaterAddresses = this.streams.getRepeatersFor(streamId)
            this.debug('stream %s is known; sending subscribe requests to repeaters %j', streamId,
                repeaterAddresses.map((a) => getIdShort(a)))
            repeaterAddresses.forEach((address) => {
                this.protocols.nodeToNode.sendSubscribe(address, streamId)
            })
            this.subscriptions.addSubscription(streamId) // Assuming subscribes went through
            this._sendStatus()
            this.emit(events.SUBSCRIBED_TO_STREAM, streamId)
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

    stop(cb) {
        this.debug('stopping')
        this.messageBuffer.clear()
        this.protocols.trackerNode.stop(cb)
        this.protocols.nodeToNode.stop(cb)
    }

    _getStatus() {
        return {
            leaderOfStreams: this.streams.getOwnStreams(),
            subscribedToStreams: this.subscriptions.getSubscriptions(),
            started: this.started
        }
    }

    _sendStatus() {
        this.debug('sending status to tracker %s', getIdShort(this.tracker))
        if (this.tracker) {
            this.protocols.trackerNode.sendStatus(this.tracker, this._getStatus())
        }
    }

    onNodeDisconnected(node) {
        const nodeAddress = getAddress(node)
        this.subscribers.removeSubscriberFromAllStreams(nodeAddress)
        this.debug('removed all subscriptions of node %s', getIdShort(node))
    }

    onTrackerDisconnected() {
        this.tracker = null
        this.debug('no tracker available')
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
}

Node.events = events

module.exports = Node
