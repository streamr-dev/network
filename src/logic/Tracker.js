const { EventEmitter } = require('events')
const debug = require('debug')('streamr:tracker')
const { generateClientId, getAddress } = require('../util')
const TrackerServer = require('../protocol/TrackerServer')
const { getPeersTopology } = require('../helpers/TopologyStrategy')

module.exports = class Tracker extends EventEmitter {
    constructor(connection) {
        super()

        this.nodes = new Map()
        this.trackerId = generateClientId('tracker')
        this.listners = {
            trackerServerListner: new TrackerServer(connection)
        }

        connection.once('node:ready', () => this.trackerReady())
        this.listners.trackerServerListner.on('streamr:tracker:find-stream', ({ sender, streamId }) => { // TODO: rename sender to requester/node
            this.sendStreamInfo(sender, streamId)
        })
        this.listners.trackerServerListner.on('streamr:tracker:send-peers', (node) => this.sendListOfNodes(node))
        this.listners.trackerServerListner.on('streamr:tracker:peer-status', ({ peer, status }) => { // TODO: rename peer to node
            this.processNodeStatus(peer, status)
        })
    }

    trackerReady() {
        debug('tracker: %s is running', this.trackerId)
    }

    sendListOfNodes(node) {
        debug('sending list of nodes')

        const listOfNodes = getPeersTopology(this.nodes, getAddress(node))
        this.listners.trackerServerListner.sendNodeList(node, listOfNodes)
    }

    processNodeStatus(node, status) {
        debug('received from %s status %s', getAddress(node), JSON.stringify(status))
        this.nodes.set(getAddress(node), status)
    }

    sendStreamInfo(node, streamId) {
        debug('tracker looking for the stream %s', streamId)

        this.nodes.forEach((status, nodeAddress) => {
            if (status.streams.includes(streamId)) {
                this.listners.trackerServerListner.sendStreamInfo(node, streamId, nodeAddress)
            }
        })
    }
}
