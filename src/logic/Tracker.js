const { EventEmitter } = require('events')
const createDebug = require('debug')
const TrackerServer = require('../protocol/TrackerServer')
const OverlayTopology = require('../logic/OverlayTopology')
const { StreamID } = require('../identifiers')

const NEIGHBORS_PER_NODE = 4

module.exports = class Tracker extends EventEmitter {
    constructor(id, trackerServer) {
        super()
        this.overlayPerStream = {} // streamKey => overlayTopology

        this.id = id
        this.protocols = {
            trackerServer
        }

        this.protocols.trackerServer.on(TrackerServer.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, (statusMessage) => this.processNodeStatus(statusMessage))

        this.debug = createDebug(`streamr:logic:tracker:${this.id}`)
        this.debug('started %s', this.id)
    }

    processNodeStatus(statusMessage) {
        const source = statusMessage.getSource()
        const status = statusMessage.getStatus()
        this._addNode(source, status.streams)
        this._formAndSendInstructions(source, status.streams)
    }

    onNodeDisconnected(node) {
        this._removeNode(node)
    }

    stop(cb) {
        this.debug('stopping tracker')
        this.protocols.trackerServer.stop(cb)
    }

    getAddress() {
        return this.protocols.trackerServer.getAddress()
    }

    _addNode(node, streams) {
        Object.entries(streams).forEach(([streamKey, { inboundNodes, outboundNodes }]) => {
            if (this.overlayPerStream[streamKey] == null) {
                this.overlayPerStream[streamKey] = new OverlayTopology(NEIGHBORS_PER_NODE)
            }
            const neighbors = new Set([...inboundNodes, ...outboundNodes])
            this.overlayPerStream[streamKey].update(node, neighbors)
        })

        this.debug('registered node %s for streams %j', node, Object.keys(streams))
    }

    _formAndSendInstructions(node, streams) {
        Object.keys(streams).forEach((streamKey) => {
            const instructions = this.overlayPerStream[streamKey].formInstructions(node)
            this.debug('sending instructions %j for stream %s', instructions, streamKey)
            Object.entries(instructions).forEach(([nodeId, newNeighbors]) => {
                this.protocols.trackerServer.sendInstruction(nodeId, StreamID.fromKey(streamKey), newNeighbors)
            })
        })
    }

    _removeNode(node) {
        Object.values(this.overlayPerStream).forEach((overlay) => overlay.leave(node))
        this.debug('unregistered node %s from tracker', node)
    }
}
