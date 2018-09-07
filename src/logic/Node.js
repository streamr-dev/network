const EventEmitter = require('events').EventEmitter
const TrackerNode = require('../protocol/TrackerNode')
const NodeToNode = require('../protocol/NodeToNode')
const encoder = require('../helpers/MessageEncoder')
const {
    generateClientId,
    getStreams,
    getAddress
} = require('../util')
const debug = require('debug')('streamr:node')

module.exports = class Node extends EventEmitter {
    constructor(connection) {
        super()

        this.connection = connection
        this.peers = new Map()
        this.knownStreams = new Map()
        this.nodeId = generateClientId('node')
        this.status = {
            streams: getStreams()
        }

        this.listners = {
            trackerNodeListner: new TrackerNode(this.connection),
            nodeToNode: new NodeToNode(this.connection)
        }

        this.connection.once('node:ready', () => this.nodeReady())
        this.listners.trackerNodeListner.on('streamr:peer:send-status', (tracker) => this.sendStatusToTracker(tracker))
        this.listners.trackerNodeListner.on('streamr:node-node:stream-data', ({
            streamId,
            data
        }) => this.sendData(streamId, data))
        this.listners.trackerNodeListner.on('streamr:node-node:connect', (peers) => this.listners.nodeToNode.emit('streamr:node-node:connect', peers))
        this.listners.trackerNodeListner.on('streamr:node:found-stream', ({
            streamId,
            nodeAddress
        }) => this.addKnownStreams(streamId, nodeAddress))

    }

    nodeReady() {
        debug('node: %s is running', this.nodeId)
        debug('handling streams: %s\n\n\n', JSON.stringify(this.status.streams))
        this.status.started = new Date().toLocaleString()

        this.subscribe()
    }

    subscribe() {
        this.status.streams.forEach((stream) => {
            this.connection.node.pubsub.subscribe(stream, (msg) => {
                console.log(msg.from, msg.data.toString())
            }, () => {})
        })
    }

    sendStatusToTracker(tracker) {
        debug('sending status to tracker')
        this.tracker = tracker
        this.connection.send(tracker, encoder.statusMessage(this.status))
    }

    // add to cache of streams
    addKnownStreams(streamId, nodeAddress) {
        debug('add to known streams %s, node %s', streamId, nodeAddress)
        this.knownStreams.set(streamId, nodeAddress)
    }

    sendData(streamId, data) {
        let foundInPeers = false
        if (this.status.streams.includes(streamId)) {
            foundInPeers = true
            debug('received data for own streamId %s', streamId)
            return
        }

        if (this.knownStreams.get(streamId) !== undefined) {
            foundInPeers = true
            this.connection.send(this.knownStreams.get(streamId), encoder.dataMessage(streamId, data))
            return
        }

        // [...this.peers].forEach((peer) => {
        //     // check status and resend data
        // })

        if (!foundInPeers) {
            debug('ask tracker about node with that streamId')
            this.connection.send(this.tracker, encoder.streamMessage(streamId, ''))
        }
    }
}
