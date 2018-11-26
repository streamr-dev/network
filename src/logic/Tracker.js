const { EventEmitter } = require('events')
const createDebug = require('debug')
const TrackerServer = require('../protocol/TrackerServer')
const { getPeersTopology } = require('../helpers/TopologyStrategy')

module.exports = class Tracker extends EventEmitter {
    constructor(id, trackerServer) {
        super()

        this.nodes = new Set()
        this.streamIdToNodes = new Map()

        this.id = id
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
        this._addNode(source, status.streams)
    }

    onNodeDisconnected(node) {
        this._removeNode(node)
    }

    sendStreamInfo(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const source = streamMessage.getSource()

        const nodesForStream = this.streamIdToNodes.get(streamId) || new Set()
        const selectedNodes = getPeersTopology([...nodesForStream], source)
        this.protocols.trackerServer.sendStreamInfo(source, streamId, selectedNodes)
        this.debug('sent stream info to %s: stream %s with nodes %j', source, streamId, selectedNodes)
    }

    stop(cb) {
        this.debug('stopping tracker')
        this.protocols.trackerServer.stop(cb)
    }

    getAddress() {
        return this.protocols.trackerServer.getAddress()
    }

    _addNode(node, streams) {
        this.nodes.add(node)
        streams.forEach((streamId) => {
            if (!this.streamIdToNodes.has(streamId)) {
                this.streamIdToNodes.set(streamId, new Set())
            }
            this.streamIdToNodes.get(streamId).add(node)
        })
        this.debug('registered node %s for streams %j', node, streams)
    }

    _removeNode(node) {
        this.nodes.delete(node)
        this.streamIdToNodes.forEach((_, streamId) => {
            this.streamIdToNodes.get(streamId).delete(node)
            if (this.streamIdToNodes.get(streamId).size === 0) {
                this.streamIdToNodes.delete(streamId)
            }
        })
        this.debug('unregistered node %s from tracker', node)
    }
}
