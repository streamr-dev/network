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
        this.listners.trackerNodeListner.on('streamr:node-node:connect', (peers) => this.listners.nodeToNode.emit('streamr:node-node:connect', peers))
    }

    nodeReady() {
        debug('node: %s is running\n\n\n', this.nodeId)
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
        this.connection.send(tracker, encoder.statusMessage(this.status))
    }
}
