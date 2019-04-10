const { EventEmitter } = require('events')
const createDebug = require('debug')
const TrackerServer = require('../protocol/TrackerServer')
const OverlayTopology = require('../logic/OverlayTopology')
const { StreamID } = require('../identifiers')
const { peerTypes } = require('../protocol/PeerBook')

module.exports = class Tracker extends EventEmitter {
    constructor(id, trackerServer, maxNeighborsPerNode) {
        super()

        this.overlayPerStream = {} // streamKey => overlayTopology
        this.storageNodes = new Map()

        this.id = id
        this.protocols = {
            trackerServer
        }

        if (!Number.isInteger(maxNeighborsPerNode)) {
            throw new Error('maxNeighborsPerNode is not an integer')
        }

        this.maxNeighborsPerNode = maxNeighborsPerNode

        this.protocols.trackerServer.on(TrackerServer.events.NODE_DISCONNECTED, ({ peerId, nodeType }) => this.onNodeDisconnected(peerId, nodeType))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, ({ statusMessage, nodeType }) => this.processNodeStatus(statusMessage, nodeType))

        this.debug = createDebug(`streamr:logic:tracker:${this.id}`)
        this.debug('started %s', this.id)
    }

    processNodeStatus(statusMessage, nodeType) {
        const source = statusMessage.getSource()
        const status = statusMessage.getStatus()

        if (nodeType === peerTypes.STORAGE) {
            this.storageNodes.set(source, status)
        }

        this._updateNode(source, status.streams)
        this._formAndSendInstructions(source, status.streams)
        this._formAndSendInstructionsToStorages()
    }

    onNodeDisconnected(node, nodeType) {
        this.storageNodes.delete(node)
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

    _formAndSendInstructionsToStorages() {
        const existingStreams = Object.keys(this.overlayPerStream)

        if (existingStreams.length) {
            let streamsToSubscribe

            this.storageNodes.forEach(async (status, storageNode) => {
                const alreadyConnected = Object.keys(status.streams)

                if (!alreadyConnected.length) {
                    streamsToSubscribe = existingStreams
                } else {
                    streamsToSubscribe = existingStreams.filter((x) => !alreadyConnected.includes(x))
                }

                if (streamsToSubscribe.length) {
                    streamsToSubscribe.forEach(async (streamKey) => {
                        try {
                            await this.protocols.trackerServer.sendInstruction(storageNode, StreamID.fromKey(streamKey), [])
                            this.debug('sent instruction %j for stream %s to storage node %s', [], streamKey, storageNode)
                        } catch (e) {
                            this.debug('failed to send instruction %j for stream %s to storage node %s because of %s', [], streamKey, storageNode, e)
                        }
                    })
                }
            })
        }
    }

    _removeNode(node) {
        Object.values(this.overlayPerStream).forEach((overlay) => overlay.leave(node))
        this.debug('unregistered node %s from tracker', node)
    }
}
