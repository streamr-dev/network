const { EventEmitter } = require('events')

const getLogger = require('../helpers/logger')
const MetricsContext = require('../helpers/MetricsContext')
const TrackerServer = require('../protocol/TrackerServer')
const { StreamIdAndPartition } = require('../identifiers')

const { attachRtcSignalling } = require('./rtcSignallingHandlers')
const InstructionCounter = require('./InstructionCounter')
const LocationManager = require('./LocationManager')
const OverlayTopology = require('./OverlayTopology')

module.exports = class Tracker extends EventEmitter {
    constructor(opts) {
        super()

        if (!Number.isInteger(opts.maxNeighborsPerNode)) {
            throw new Error('maxNeighborsPerNode is not an integer')
        }

        this.opts = {
            protocols: [],
            metricsContext: new MetricsContext(null),
            ...opts
        }

        if (!(this.opts.protocols.trackerServer instanceof TrackerServer)) {
            throw new Error('Provided protocols are not correct')
        }

        this.overlayPerStream = {} // streamKey => overlayTopology, where streamKey = streamId::partition
        this.overlayConnectionRtts = {} // nodeId => connected nodeId => rtt
        this.locationManager = new LocationManager()
        this.instructionCounter = new InstructionCounter()
        this.storageNodes = new Set()

        this.protocols = opts.protocols
        this.peerInfo = opts.peerInfo

        this.protocols.trackerServer.on(TrackerServer.events.NODE_CONNECTED, (nodeId, isStorage) => {
            this.onNodeConnected(nodeId, isStorage)
        })
        this.protocols.trackerServer.on(TrackerServer.events.NODE_DISCONNECTED, (nodeId) => {
            this.onNodeDisconnected(nodeId)
        })
        this.protocols.trackerServer.on(TrackerServer.events.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            this.processNodeStatus(statusMessage, nodeId)
        })
        this.protocols.trackerServer.on(TrackerServer.events.STORAGE_NODES_REQUEST, (message, nodeId) => {
            this.findStorageNodes(message, nodeId)
        })
        attachRtcSignalling(this.protocols.trackerServer)

        this.logger = getLogger(`streamr:logic:tracker:${this.peerInfo.peerId}`)
        this.logger.debug('started %s', this.peerInfo.peerId)

        this.metrics = this.opts.metricsContext.create('tracker')
            .addRecordedMetric('onNodeDisconnected')
            .addRecordedMetric('processNodeStatus')
            .addRecordedMetric('findStorageNodes')
            .addRecordedMetric('instructionsSent')
            .addRecordedMetric('_removeNode')
    }

    onNodeConnected(node, isStorage) {
        if (isStorage) {
            this.storageNodes.add(node)
        }
    }

    onNodeDisconnected(node) {
        this.metrics.record('onNodeDisconnected', 1)
        this._removeNode(node)
        this.logger.debug('unregistered node %s from tracker', node)
    }

    processNodeStatus(statusMessage, source) {
        this.metrics.record('processNodeStatus', 1)
        const { status } = statusMessage
        const { streams, rtts, location } = status
        const filteredStreams = this.instructionCounter.filterStatus(status, source)

        // update RTTs and location
        this.overlayConnectionRtts[source] = rtts
        this.locationManager.updateLocation({
            nodeId: source,
            location,
            address: this.protocols.trackerServer.endpoint.resolveAddress(source),
        })

        // update topology
        this._createNewOverlayTopologies(streams)
        this._updateAllStorages()
        if (!this.storageNodes.has(source)) {
            this._updateNode(source, filteredStreams, streams)
            this._formAndSendInstructions(source, Object.keys(streams))
        } else {
            this._formAndSendInstructions(source, Object.keys(this.overlayPerStream))
        }
    }

    findStorageNodes(storageNodesRequest, source) {
        this.metrics.record('findStorageNodes', 1)
        const streamId = StreamIdAndPartition.fromMessage(storageNodesRequest)
        const storageNodeIds = [...this.storageNodes].filter((s) => s !== source)
        this.protocols.trackerServer.sendStorageNodesResponse(source, streamId, storageNodeIds)
            .catch((e) => {
                this.logger.error(`Failed to sendStorageNodes to node ${source}, ${streamId} because of ${e}`)
            })
    }

    stop() {
        this.logger.debug('stopping tracker')
        return this.protocols.trackerServer.stop()
    }

    getAddress() {
        return this.protocols.trackerServer.getAddress()
    }

    _createNewOverlayTopologies(streams) {
        Object.keys(streams).forEach((streamId) => {
            if (this.overlayPerStream[streamId] == null) {
                this.overlayPerStream[streamId] = new OverlayTopology(this.opts.maxNeighborsPerNode)
            }
        })
    }

    // Ensure each storage node is associated with each stream
    _updateAllStorages() {
        Object.values(this.overlayPerStream).forEach((overlayTopology) => {
            this.storageNodes.forEach((storageNode) => {
                if (!overlayTopology.hasNode(storageNode)) {
                    overlayTopology.update(storageNode, [])
                }
            })
        })
    }

    _updateNode(node, filteredStreams, allStreams) {
        // Add or update
        Object.entries(filteredStreams).forEach(([streamKey, { inboundNodes, outboundNodes }]) => {
            const neighbors = new Set([...inboundNodes, ...outboundNodes])
            this.overlayPerStream[streamKey].update(node, neighbors)
        })

        // Remove
        const currentStreamKeys = new Set(Object.keys(allStreams))
        Object.entries(this.overlayPerStream)
            .filter(([streamKey, _]) => !currentStreamKeys.has(streamKey))
            .forEach(([streamKey, overlayTopology]) => this._leaveAndCheckEmptyOverlay(streamKey, overlayTopology, node))

        this.logger.debug('update node %s for streams %j', node, Object.keys(allStreams))
    }

    _formAndSendInstructions(node, streamKeys, forceGenerate = false) {
        streamKeys.forEach((streamKey) => {
            const instructions = this.overlayPerStream[streamKey].formInstructions(node, forceGenerate)
            Object.entries(instructions).forEach(([nodeId, newNeighbors]) => {
                this.metrics.record('instructionsSent', 1)
                try {
                    const counterValue = this.instructionCounter.setOrIncrement(nodeId, streamKey)
                    this.protocols.trackerServer.sendInstruction(nodeId, StreamIdAndPartition.fromKey(streamKey), newNeighbors, counterValue)
                    this.logger.debug('sent instruction %j (%d) for stream %s to node %s', newNeighbors, counterValue, streamKey, nodeId)
                } catch (e) {
                    this.logger.error(`Failed to _formAndSendInstructions to node ${nodeId}, streamKey ${streamKey}, because of ${e}`)
                }
            })
        })
    }

    _removeNode(node) {
        this.metrics.record('_removeNode', 1)
        this.storageNodes.delete(node)
        delete this.overlayConnectionRtts[node]
        this.locationManager.removeNode(node)
        Object.entries(this.overlayPerStream)
            .forEach(([streamKey, overlayTopology]) => this._leaveAndCheckEmptyOverlay(streamKey, overlayTopology, node))
    }

    _leaveAndCheckEmptyOverlay(streamKey, overlayTopology, node) {
        const neighbors = overlayTopology.leave(node)
        this.instructionCounter.removeNode(node)

        if (overlayTopology.isEmpty()) {
            this.instructionCounter.removeStream(streamKey)
            delete this.overlayPerStream[streamKey]
        } else {
            neighbors.forEach((neighbor) => {
                this._formAndSendInstructions(neighbor, [streamKey], true)
            })
        }
    }

    getTopology(streamId = null, partition = null) {
        const topology = {}

        let streamKeys = []

        if (streamId && partition === null) {
            streamKeys = Object.keys(this.overlayPerStream).filter((streamKey) => streamKey.includes(streamId))
        } else {
            let askedStreamKey = null
            if (streamId && Number.isSafeInteger(partition) && partition >= 0) {
                askedStreamKey = new StreamIdAndPartition(streamId, Number.parseInt(partition, 10))
            }

            streamKeys = askedStreamKey
                ? Object.keys(this.overlayPerStream).filter((streamKey) => streamKey === askedStreamKey.toString())
                : Object.keys(this.overlayPerStream)
        }

        streamKeys.forEach((streamKey) => {
            topology[streamKey] = this.overlayPerStream[streamKey].state()
        })

        return topology
    }

    getStreams() {
        return Object.keys(this.overlayPerStream)
    }

    getAllNodeLocations() {
        return this.locationManager.getAllNodeLocations()
    }

    getNodeLocation(node) {
        return this.locationManager.getNodeLocation(node)
    }

    getStorageNodes() {
        return [...this.storageNodes.keys()]
    }
}
