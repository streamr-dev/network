const { EventEmitter } = require('events')

const createDebug = require('debug')

const TrackerServer = require('../protocol/TrackerServer')
const OverlayTopology = require('../logic/OverlayTopology')
const { StreamIdAndPartition } = require('../identifiers')
const Metrics = require('../metrics')
const { peerTypes } = require('../protocol/PeerBook')

module.exports = class Tracker extends EventEmitter {
    constructor(opts) {
        super()

        if (!Number.isInteger(opts.maxNeighborsPerNode)) {
            throw new Error('maxNeighborsPerNode is not an integer')
        }

        // set default options
        const defaultOptions = {
            id: 'tracker',
            protocols: []
        }

        this.opts = Object.assign({}, defaultOptions, opts)

        if (!(this.opts.protocols.trackerServer instanceof TrackerServer)) {
            throw new Error('Provided protocols are not correct')
        }

        this.overlayPerStream = {} // streamKey => overlayTopology
        this.storageNodes = new Map()

        this.protocols = opts.protocols

        this.protocols.trackerServer.on(TrackerServer.events.NODE_DISCONNECTED, ({ peerId, nodeType }) => this.onNodeDisconnected(peerId, nodeType))
        this.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, ({ statusMessage, nodeType }) => this.processNodeStatus(statusMessage, nodeType))
        this.protocols.trackerServer.on(TrackerServer.events.FIND_STORAGE_NODES_REQUEST, this.findStorageNodes.bind(this))

        this.metrics = new Metrics(this.opts.id)

        this.debug = createDebug(`streamr:logic:tracker:${this.opts.id}`)
        this.debug('started %s', this.opts.id)
    }

    processNodeStatus(statusMessage, nodeType) {
        this.metrics.inc('processNodeStatus')

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
        this.metrics.inc('onNodeDisconnected')
        this.storageNodes.delete(node)
        this._removeNode(node)
    }

    findStorageNodes(findStorageNodesMessage) {
        this.metrics.inc('findStorageNodes')
        const streamId = findStorageNodesMessage.getStreamId()
        const source = findStorageNodesMessage.getSource()

        const foundStorageNodes = []
        this.storageNodes.forEach((status, node) => {
            const streams = Object.keys(status.streams)
            if (streams.includes(streamId.key())) {
                foundStorageNodes.push(node)
            }
        })

        this.protocols.trackerServer.sendStorageNodes(source, streamId, foundStorageNodes)
    }

    stop(cb) {
        this.debug('stopping tracker')
        return this.protocols.trackerServer.stop(cb)
    }

    getAddress() {
        return this.protocols.trackerServer.getAddress()
    }

    _updateNode(node, streams) {
        let newNode = true

        // Add or update
        Object.entries(streams).forEach(([streamKey, { inboundNodes, outboundNodes }]) => {
            if (this.overlayPerStream[streamKey] == null) {
                this.overlayPerStream[streamKey] = new OverlayTopology(this.opts.maxNeighborsPerNode)
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
        this.metrics.inc('_formAndSendInstructions')
        Object.keys(streams).forEach((streamKey) => {
            const instructions = this.overlayPerStream[streamKey].formInstructions(node)
            Object.entries(instructions).forEach(async ([nodeId, newNeighbors]) => {
                try {
                    await this.protocols.trackerServer.sendInstruction(nodeId, StreamIdAndPartition.fromKey(streamKey), newNeighbors)
                    this.debug('sent instruction %j for stream %s to node %s', newNeighbors, streamKey, nodeId)
                } catch (e) {
                    this.debug('failed to send instruction %j for stream %s to node %s because of %s', newNeighbors, streamKey, nodeId, e)
                }
            })
        })
    }

    _formAndSendInstructionsToStorages() {
        this.metrics.inc('_formAndSendInstructionsToStorages')
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
                            await this.protocols.trackerServer.sendInstruction(storageNode, StreamIdAndPartition.fromKey(streamKey), [])
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
        this.metrics.inc('_removeNode')
        Object.values(this.overlayPerStream).forEach((overlay) => overlay.leave(node))
        this.debug('unregistered node %s from tracker', node)
    }

    async getMetrics() {
        const endpointMetrics = this.protocols.trackerServer.endpoint.getMetrics()
        const processMetrics = await this.metrics.getPidusage()
        const trackerMetrics = this.metrics.report()
        const mainMetrics = this.metrics.prettify(endpointMetrics)

        return {
            mainMetrics,
            endpointMetrics,
            processMetrics,
            trackerMetrics
        }
    }
}
