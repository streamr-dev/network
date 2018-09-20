const { EventEmitter } = require('events')
const createDebug = require('debug')
const { getAddress, getIdShort } = require('../util')
const TrackerServer = require('../protocol/TrackerServer')
const { getPeersTopology } = require('../helpers/TopologyStrategy')

module.exports = class Tracker extends EventEmitter {
    constructor(trackerServer) {
        super()

        this.nodes = new Map()
        this.id = getIdShort(trackerServer.connection.node.peerInfo) // TODO: Better way?
        this.protocols = {
            trackerServer
        }

        this.protocols.trackerServer.on(TrackerServer.events.STREAM_INFO_REQUESTED, ({ sender, streamId }) => { // TODO: rename sender to requester/node
            this.sendStreamInfo(sender, streamId)
        })
        this.protocols.trackerServer.on(TrackerServer.events.NODE_LIST_REQUESTED, (node) => this.sendListOfNodes(node))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, ({ peer, status }) => { // TODO: rename peer to node
            this.processNodeStatus(peer, status)
        })

        this.debug = createDebug(`streamr:logic:tracker:${this.id}`)
        this.debug('started %s', this.id)
    }

    sendListOfNodes(node) {
        const listOfNodes = getPeersTopology([...this.nodes.keys()], getAddress(node))

        if (listOfNodes.length) {
            this.debug('sending list of %d nodes to %s', listOfNodes.length, getIdShort(node))
            this.protocols.trackerServer.sendNodeList(node, listOfNodes)
        } else {
            this.debug('no available nodes to send to %s', getIdShort(node))
        }
    }

    processNodeStatus(node, status) {
        this.debug('received from %s status %s', getIdShort(node), JSON.stringify(status))
        this.nodes.set(getAddress(node), status)
    }

    sendStreamInfo(node, streamId) {
        this.debug('looking for stream %s', streamId)

        let nodeAddress
        this.nodes.forEach((status, knownNodeAddress) => {
            if (status.streams.includes(streamId)) {
                nodeAddress = knownNodeAddress
            }
        })

        if (nodeAddress === undefined) {
            this.debug('stream %s assigned to %s', streamId, getIdShort(node))
            nodeAddress = getAddress(node)
        } else {
            this.debug('stream %s found, responding to %s', streamId, getIdShort(node))
        }

        this.protocols.trackerServer.sendStreamInfo(node, streamId, nodeAddress)
    }

    stop(cb) {
        this.debug('stopping')
        this.protocols.trackerServer.stop(cb)
    }

    getAddress() {
        return this.protocols.trackerServer.getAddress()
    }
}
