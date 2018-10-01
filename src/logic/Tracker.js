const { EventEmitter } = require('events')
const createDebug = require('debug')
const { getAddress, getIdShort } = require('../util')
const TrackerServer = require('../protocol/TrackerServer')
const { getPeersTopology } = require('../helpers/TopologyStrategy')

module.exports = class Tracker extends EventEmitter {
    constructor(trackerServer) {
        super()

        this.nodes = new Map()
        this.id = getIdShort(trackerServer.endpoint.node.peerInfo) // TODO: Better way?
        this.protocols = {
            trackerServer
        }

        this.protocols.trackerServer.on(TrackerServer.events.STREAM_INFO_REQUESTED, (streamMessage) => this.sendStreamInfo(streamMessage))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_LIST_REQUESTED, (node) => this.sendListOfNodes(node))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, (statusMessage) => this.processNodeStatus(statusMessage))

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

    processNodeStatus(statusMessage) {
        this.debug('received from %s status %s', getIdShort(statusMessage.getSource()), JSON.stringify(statusMessage.getStatus()))
        this.nodes.set(getAddress(statusMessage.getSource()), statusMessage.getStatus())
    }

    onNodeDisconnected(node) {
        this.debug('removing node %s from tracker node list', getIdShort(node))
        this.nodes.delete(getAddress(node))
    }

    sendStreamInfo(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const source = streamMessage.getSource()

        this.debug('looking for stream %s', streamId)

        let nodeAddress
        this.nodes.forEach((status, knownNodeAddress) => {
            if (status.streams.includes(streamId)) {
                nodeAddress = knownNodeAddress
            }
        })

        if (nodeAddress === undefined) {
            this.debug('stream %s assigned to %s', streamId, getIdShort(source))
            nodeAddress = getAddress(source)
        } else {
            this.debug('stream %s found, responding to %s', streamId, getIdShort(source))
        }

        this.protocols.trackerServer.sendStreamInfo(source, streamId, nodeAddress)
    }

    stop(cb) {
        this.debug('stopping')
        this.protocols.trackerServer.stop(cb)
    }

    getAddress() {
        return this.protocols.trackerServer.getAddress()
    }
}
