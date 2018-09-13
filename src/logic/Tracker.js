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
        this.protocols = {
            trackerServer: new TrackerServer(connection)
        }

        this.protocols.trackerServer.on(TrackerServer.events.STREAM_INFO_REQUESTED, ({ sender, streamId }) => { // TODO: rename sender to requester/node
            this.sendStreamInfo(sender, streamId)
        })
        this.protocols.trackerServer.on(TrackerServer.events.NODE_LIST_REQUESTED, (node) => this.sendListOfNodes(node))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, ({ peer, status }) => { // TODO: rename peer to node
            this.processNodeStatus(peer, status)
        })

        debug('tracker: %s is running', this.trackerId)
    }

    sendListOfNodes(node) {
        debug('sending list of nodes')

        const listOfNodes = getPeersTopology(this.nodes, getAddress(node))
        this.protocols.trackerServer.sendNodeList(node, listOfNodes)
    }

    processNodeStatus(node, status) {
        debug('received from %s status %s', getAddress(node), JSON.stringify(status))
        this.nodes.set(getAddress(node), status)
    }

    sendStreamInfo(node, streamId) {
        debug('tracker looking for the stream %s', streamId)

        this.nodes.forEach((status, nodeAddress) => {
            if (status.streams.includes(streamId)) {
                this.protocols.trackerServer.sendStreamInfo(node, streamId, nodeAddress)
            }
        })
    }

    stop(cb) {
        this.protocols.trackerServer.stop(cb)
    }

    getAddress() {
        return this.protocols.trackerServer.getAddress()
    }
}
