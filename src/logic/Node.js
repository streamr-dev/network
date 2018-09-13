const { EventEmitter } = require('events')
const debug = require('debug')('streamr:logic:node')
const TrackerNode = require('../protocol/TrackerNode')
const NodeToNode = require('../protocol/NodeToNode')
const { generateClientId, getStreams } = require('../util')

const events = Object.freeze({
    MESSAGE_RECEIVED: 'streamr:node:message-received',
})

class Node extends EventEmitter {
    constructor(connection) {
        super()

        this.knownStreams = new Map()
        this.nodeId = generateClientId('node')
        this.status = {
            streams: getStreams()
        }

        this.protocols = {
            trackerNode: new TrackerNode(connection),
            nodeToNode: new NodeToNode(connection)
        }

        connection.once('node:ready', () => this.onNodeReady())
        this.protocols.trackerNode.on(TrackerNode.events.CONNECTED_TO_TRACKER, (tracker) => this.onConnectedToTracker(tracker))
        this.protocols.trackerNode.on(TrackerNode.events.DATA_RECEIVED, ({ streamId, data }) => this.onDataReceived(streamId, data))
        this.protocols.trackerNode.on(TrackerNode.events.NODE_LIST_RECEIVED, (nodes) => this.protocols.nodeToNode.connectToNodes(nodes))
        this.protocols.trackerNode.on(TrackerNode.events.STREAM_INFO_RECEIVED, ({ streamId, nodeAddress }) => {
            this.addKnownStreams(streamId, nodeAddress)
        })

        debug('node: %s is running', this.nodeId)
        debug('handling streams: %s\n\n\n', JSON.stringify(this.status.streams))
        this.status.started = new Date().toLocaleString()

        this._subscribe()
    }

    _subscribe() {
        this.status.streams.forEach((stream) => {
            this.protocols.nodeToNode.subscribeToStream(stream, (msg) => {
                console.log(msg.from, msg.data.toString())
            }, () => {})
        })
    }

    onConnectedToTracker(tracker) {
        debug('connected to tracker; sending status to tracker')
        this.tracker = tracker
        this.protocols.trackerNode.sendStatus(tracker, this.status)
    }

    // add to cache of streams
    addKnownStreams(streamId, nodeAddress) {
        debug('add to known streams %s, node %s', streamId, nodeAddress)
        this.knownStreams.set(streamId, nodeAddress)
    }

    onDataReceived(streamId, data) {
        if (this._isOwnStream(streamId)) {
            debug('received data for own streamId %s', streamId)
            this.emit(events.DATA_RECEIVED, streamId, data)
        } else if (this._isKnownStream(streamId)) {
            const receiverNode = this.knownStreams.get(streamId)
            this.protocols.nodeToNode.sendData(receiverNode, streamId, data)
        } else {
            debug('ask tracker about node with that streamId')
            this.protocols.trackerNode.requestStreamInfo(this.tracker, streamId)
        }
    }

    _isOwnStream(streamId) {
        return this.status.streams.includes(streamId)
    }

    _isKnownStream(streamId) {
        return this.knownStreams.get(streamId) !== undefined
    }
}

Node.events = events

module.exports = Node
