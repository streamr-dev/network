const { EventEmitter } = require('events')
const createDebug = require('debug')
const TrackerServer = require('../protocol/TrackerServer')
const { getPeersTopology } = require('../helpers/TopologyStrategy')

module.exports = class Tracker extends EventEmitter {
    constructor(id, peerBook, trackerServer) {
        super()

        this.nodes = new Set()
        this.streamIdToNodes = new Map()

        this.id = id
        this.peerBook = peerBook
        this.protocols = {
            trackerServer
        }

        this.protocols.trackerServer.on(TrackerServer.events.STREAM_INFO_REQUESTED, (streamMessage) => this.sendStreamInfo(streamMessage))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, (statusMessage) => this.processNodeStatus(statusMessage))

        this.debug = createDebug(`streamr:logic:tracker:${this.id}`)
        this.debug('started %s', this.id)
    }

    processNodeStatus(statusMessage) {
        const source = statusMessage.getSource()
        const status = statusMessage.getStatus()
        this.debug('received from %s status %s', this.peerBook.getShortId(source), JSON.stringify(status))
        this._addNode(source, status.ownStreams)
    }

    onNodeDisconnected(node) {
        this.debug('removing node %s from tracker node list', this.peerBook.getShortId(node))
        this._removeNode(node)
    }

    sendStreamInfo(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const source = streamMessage.getSource()

        this.debug('looking for stream %s', streamId)

        const nodesForStream = this.streamIdToNodes.get(streamId) || new Set()

        if (nodesForStream.size === 0) {
            // TODO: stream assignment to node
            this.debug('assigning stream %s to node %s', streamId, this.peerBook.getShortId(source))
            this._addNode(source, [streamId])
            this.protocols.trackerServer.sendStreamInfo(source, streamId, [source])
        } else {
            const selectedNodes = getPeersTopology([...nodesForStream], source)
            this.debug('stream %s found; responding to %s with nodes %j',
                streamId, this.peerBook.getShortId(source), selectedNodes.map((s) => this.peerBook.getShortId(s)))

            this.protocols.trackerServer.sendStreamInfo(source, streamId, selectedNodes)
        }
    }

    stop(cb) {
        this.debug('stopping tracker')
        this.protocols.trackerServer.stop(cb)
    }

    getAddress() {
        return this.protocols.trackerServer.getAddress()
    }

    _addNode(nodeAddress, streams) {
        this.nodes.add(nodeAddress)
        streams.forEach((streamId) => {
            if (!this.streamIdToNodes.has(streamId)) {
                this.streamIdToNodes.set(streamId, new Set())
            }
            this.streamIdToNodes.get(streamId).add(nodeAddress)
        })
    }

    _removeNode(nodeAddress) {
        this.nodes.delete(nodeAddress)
        this.streamIdToNodes.forEach((_, streamId) => {
            this.streamIdToNodes.get(streamId).delete(nodeAddress)
            if (this.streamIdToNodes.get(streamId).size === 0) {
                this.streamIdToNodes.delete(streamId)
            }
        })
    }
}
