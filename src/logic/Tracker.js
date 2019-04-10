const { EventEmitter } = require('events')
const createDebug = require('debug')
const TrackerServer = require('../protocol/TrackerServer')
const OverlayTopology = require('../logic/OverlayTopology')
const { StreamID } = require('../identifiers')

module.exports = class Tracker extends EventEmitter {
    constructor(id, trackerServer, maxNeighborsPerNode) {
        super()
        this.overlayPerStream = {} // streamKey => overlayTopology

        this.id = id
        this.protocols = {
            trackerServer
        }

        if (!Number.isInteger(maxNeighborsPerNode)) {
            throw new Error('maxNeighborsPerNode is not an integer')
        }

        this.maxNeighborsPerNode = maxNeighborsPerNode

        this.protocols.trackerServer.on(TrackerServer.events.NODE_DISCONNECTED, (node) => this.onNodeDisconnected(node))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, (statusMessage) => this.processNodeStatus(statusMessage))

        this.debug = createDebug(`streamr:logic:tracker:${this.id}`)
        this.debug('started %s', this.id)
    }

    processNodeStatus(statusMessage) {
        const source = statusMessage.getSource()
        const status = statusMessage.getStatus()
        this._updateNode(source, status.streams)
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

    _updateNode(node, streams) {
        let newNode = true

        // Add or update
        Object.entries(streams).forEach(([streamKey, { inboundNodes, outboundNodes }]) => {
            if (this.overlayPerStream[streamKey] == null) {
                this.overlayPerStream[streamKey] = new OverlayTopology(this.maxNeighborsPerNode)
            }

            newNode = this.overlayPerStream[streamKey].hasNode(node)

            const neighbors = new Set([...inboundNodes, ...outboundNodes])
            this.overlayPerStream[streamKey].update(node, neighbors)
        })

        // Remove
        const currentStreamKeys = new Set(Object.keys(streams))
        Object.entries(this.overlayPerStream)
            .filter(([streamKey, _]) => !currentStreamKeys.has(streamKey))
            .forEach(([_, overlayTopology]) => overlayTopology.leave(node))

        if (newNode) {
            this.debug('registered new node %s for streams %j', node, Object.keys(streams))
        } else {
            this.debug('setup existing node %s for streams %j', node, Object.keys(streams))
        }
    }

    _formAndSendInstructions(node, streams) {
        Object.keys(streams).forEach((streamKey) => {
            const instructions = this.overlayPerStream[streamKey].formInstructions(node)
            Object.entries(instructions).forEach(async ([nodeId, newNeighbors]) => {
                try {
                    await this.protocols.trackerServer.sendInstruction(nodeId, StreamID.fromKey(streamKey), newNeighbors)
                    this.debug('sent instruction %j for stream %s to node %s', newNeighbors, streamKey, nodeId)
                } catch (e) {
                    this.debug('failed to send instruction %j for stream %s to node %s because of %s', newNeighbors, streamKey, nodeId, e)
                }
            })
        })
    }

    _removeNode(node) {
        Object.values(this.overlayPerStream).forEach((overlay) => overlay.leave(node))
        this.debug('unregistered node %s from tracker', node)
    }
}
