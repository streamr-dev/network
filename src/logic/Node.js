const { EventEmitter } = require('events')
const createDebug = require('debug')
const TrackerNode = require('../protocol/TrackerNode')
const NodeToNode = require('../protocol/NodeToNode')
const { getIdShort } = require('../util')

const events = Object.freeze({
    MESSAGE_RECEIVED: 'streamr:node:message-received',
    NO_AVAILABLE_TRACKERS: 'streamr:node:no-trackers',
})

class Node extends EventEmitter {
    constructor(trackerNode, nodeToNode) {
        super()

        this.knownStreams = new Map()
        this.ownStreams = new Set()

        this.id = getIdShort(nodeToNode.endpoint.node.peerInfo) // TODO: better way?
        this.tracker = null

        this.protocols = {
            trackerNode,
            nodeToNode
        }

        this.protocols.trackerNode.on(TrackerNode.events.CONNECTED_TO_TRACKER, (tracker) => this.onConnectedToTracker(tracker))
        this.protocols.trackerNode.on(TrackerNode.events.DATA_RECEIVED, ({ streamId, data }) => this.onDataReceived(streamId, data))
        this.protocols.trackerNode.on(TrackerNode.events.NODE_LIST_RECEIVED, (nodes) => this.protocols.nodeToNode.connectToNodes(nodes))
        this.protocols.trackerNode.on(TrackerNode.events.STREAM_ASSIGNED, (streamId) => this.addOwnStream(streamId))
        this.protocols.trackerNode.on(TrackerNode.events.STREAM_INFO_RECEIVED, ({ streamId, nodeAddress }) => {
            this.addKnownStreams(streamId, nodeAddress)
        })

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
    }

    addOwnStream(streamId) {
        this.debug('stream %s added to own streams', streamId)
        this.ownStreams.add(streamId)
        this._sendStatus(this.tracker)
    }

    // add to cache of streams
    addKnownStreams(streamId, nodeAddress) {
        this.debug('stream %s added to known streams for address %s', streamId, nodeAddress)
        this.knownStreams.set(streamId, nodeAddress)
    }

    onDataReceived(streamId, data) {
        if (this.isOwnStream(streamId)) {
            this.debug('received data for own stream %s', streamId)
            this.emit(events.MESSAGE_RECEIVED, streamId, data)
        } else if (this._isKnownStream(streamId)) {
            const receiverNode = this.knownStreams.get(streamId)
            this.debug('forwarding stream %s data to %s', streamId, receiverNode)
            this.protocols.nodeToNode.sendData(receiverNode, streamId, data)
        } else if (this.tracker === null) {
            this.debug('no trackers available; attempted to ask about stream %s', streamId)
            this.emit(events.NO_AVAILABLE_TRACKERS)
        } else {
            this.debug('ask tracker %s who is responsible for stream %s', getIdShort(this.tracker), streamId)
            this.protocols.trackerNode.requestStreamInfo(this.tracker, streamId)
        }
    }

    isOwnStream(streamId) {
        return this.ownStreams.has(streamId)
    }

    _isKnownStream(streamId) {
        return this.knownStreams.get(streamId) !== undefined
    }

    stop(cb) {
        this.debug('stopping')
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
}

Node.events = events

module.exports = Node
