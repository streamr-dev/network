const { EventEmitter } = require('events')
const uuidv4 = require('uuid/v4')
const createDebug = require('debug')
const { getAddress, getIdShort } = require('../util')
const TrackerServer = require('../protocol/TrackerServer')
const { getPeersTopology } = require('../helpers/TopologyStrategy')

module.exports = class Tracker extends EventEmitter {
    constructor(id, trackerServer) {
        super()

        this.nodes = new Map()

        this.id = id || uuidv4()
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
        this.nodes.set(statusMessage.getSource(), statusMessage.getStatus())
    }

    onNodeDisconnected(node) {
        this.debug('removing node %s from tracker node list', getIdShort(node))
        this.nodes.delete(getAddress(node))
    }

    sendStreamInfo(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const source = streamMessage.getSource()

        this.debug('looking for stream %s', streamId)

        let leaderNode = null
        const repeaterNodes = []
        this.nodes.forEach((status, nodeAddress) => {
            if (status.leaderOfStreams.includes(streamId)) {
                if (leaderNode) {
                    throw new Error('Duplicate leaders detected.')
                }
                leaderNode = nodeAddress
                repeaterNodes.push(nodeAddress)
            } else if (status.subscribedToStreams.includes(streamId)) {
                repeaterNodes.push(nodeAddress)
            }
        })

        let selectedRepeaters
        if (leaderNode === null) {
            leaderNode = getAddress(source)
            selectedRepeaters = [leaderNode]
            this.debug('stream %s not found; assigning %s as leader', streamId, getIdShort(source))
        } else {
            selectedRepeaters = getPeersTopology(repeaterNodes, source)
            this.debug('stream %s found; responding to %s with leader %s and repeaters %j',
                streamId, getIdShort(source), getIdShort(leaderNode), selectedRepeaters.map((s) => getIdShort(s)))
        }

        this.protocols.trackerServer.sendStreamInfo(source, streamId, leaderNode, selectedRepeaters)
    }

    stop(cb) {
        this.debug('stopping tracker')
        this.protocols.trackerServer.stop(cb)
    }

    getAddress() {
        return this.protocols.trackerServer.getAddress()
    }
}
