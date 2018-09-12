const { EventEmitter } = require('events')
const debug = require('debug')('streamr:node')
const TrackerNode = require('../protocol/TrackerNode')
const NodeToNode = require('../protocol/NodeToNode')
const { generateClientId, getStreams } = require('../util')

module.exports = class Node extends EventEmitter {
    constructor(connection) {
        super()

        this.knownStreams = new Map()
        this.nodeId = generateClientId('node')
        this.status = {
            streams: getStreams()
        }

        this.listners = {
            trackerNodeListner: new TrackerNode(connection),
            nodeToNode: new NodeToNode(connection)
        }

        connection.once('node:ready', () => this.onNodeReady())
        this.listners.trackerNodeListner.on('streamr:peer:send-status', (tracker) => this.onConnectedToTracker(tracker))
        this.listners.trackerNodeListner.on('streamr:node-node:stream-data', ({ streamId, data }) => this.onDataReceived(streamId, data))
        this.listners.trackerNodeListner.on('streamr:node-node:connect', (nodes) => this.listners.nodeToNode.connectToNodes(nodes))
        this.listners.trackerNodeListner.on('streamr:node:found-stream', ({ streamId, nodeAddress }) => this.addKnownStreams(streamId, nodeAddress))
    }

    onNodeReady() {
        debug('node: %s is running', this.nodeId)
        debug('handling streams: %s\n\n\n', JSON.stringify(this.status.streams))
        this.status.started = new Date().toLocaleString()

        this._subscribe()
    }

    _subscribe() {
        this.status.streams.forEach((stream) => {
            this.listners.nodeToNode.subscribeToStream(stream, (msg) => {
                console.log(msg.from, msg.data.toString())
            }, () => {})
        })
    }

    onConnectedToTracker(tracker) {
        debug('connected to tracker; sending status to tracker')
        this.tracker = tracker
        this.listners.trackerNodeListner.sendStatus(tracker, this.status)
    }

    // add to cache of streams
    addKnownStreams(streamId, nodeAddress) {
        debug('add to known streams %s, node %s', streamId, nodeAddress)
        this.knownStreams.set(streamId, nodeAddress)
    }

    onDataReceived(streamId, data) {
        if (this._isOwnStream(streamId)) {
            debug('received data for own streamId %s', streamId)
        } else if (this._isKnownStream(streamId)) {
            const receiverNode = this.knownStreams.get(streamId)
            this.listners.nodeToNode.sendData(receiverNode, streamId, data)
        } else {
            debug('ask tracker about node with that streamId')
            this.listners.trackerNodeListner.requestStreamInfo(this.tracker, streamId)
        }
    }

    _isOwnStream(streamId) {
        return this.status.streams.includes(streamId)
    }

    _isKnownStream(streamId) {
        return this.knownStreams.get(streamId) !== undefined
    }
}
