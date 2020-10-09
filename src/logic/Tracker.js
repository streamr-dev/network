const { EventEmitter } = require('events')

const getLogger = require('../helpers/logger')
const TrackerServer = require('../protocol/TrackerServer')
const { StreamIdAndPartition } = require('../identifiers')
const Metrics = require('../metrics')

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

        this.metrics = new Metrics(this.peerInfo.peerId)

        this.logger = getLogger(`streamr:logic:tracker:${this.peerInfo.peerId}`)
        this.logger.debug('started %s', this.peerInfo.peerId)
    }

    onNodeConnected(node, isStorage) {
        if (isStorage) {
            this.storageNodes.add(node)
        }
    }

    onNodeDisconnected(node) {
        this.metrics.inc('onNodeDisconnected')
        this._removeNode(node)
        this.logger.debug('unregistered node %s from tracker', node)
    }

    processNodeStatus(statusMessage, source) {
        this.metrics.inc('processNodeStatus')
        const { status } = statusMessage
        const { streams, rtts, location } = status
        const filteredStreams = this.instructionCounter.filterStatus(status, source)

        // update RTTs and location
        this.overlayConnectionRtts[source] = rtts
        this.locationManager.updateLocation({
            node: source,
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
        this.metrics.inc('findStorageNodes')
        const streamId = StreamIdAndPartition.fromMessage(storageNodesRequest)
        this.protocols.trackerServer.sendStorageNodesResponse(source, streamId, [...this.storageNodes])
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

    _formAndSendInstructions(node, streamKeys) {
        streamKeys.forEach((streamKey) => {
            const instructions = this.overlayPerStream[streamKey].formInstructions(node)
            Object.entries(instructions).forEach(([nodeId, newNeighbors]) => {
                this.metrics.inc('sendInstruction')
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
        this.metrics.inc('_removeNode')
        this.storageNodes.delete(node)
        delete this.overlayConnectionRtts[node]
        this.locationManager.removeNode(node)
        Object.entries(this.overlayPerStream)
            .forEach(([streamKey, overlayTopology]) => this._leaveAndCheckEmptyOverlay(streamKey, overlayTopology, node))
    }

    _leaveAndCheckEmptyOverlay(streamKey, overlayTopology, node) {
        overlayTopology.leave(node)
        this.instructionCounter.removeNode(node)

        if (overlayTopology.isEmpty()) {
            this.instructionCounter.removeStream(streamKey)
            delete this.overlayPerStream[streamKey]
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

    getAllNodeLocations() {
        return this.locationManager.getAllNodeLocations()
    }

    getNodeLocation(node) {
        return this.locationManager.getNodeLocation(node)
    }

    getStorageNodes() {
        return [...this.storageNodes.keys()]
    }

    async getMetrics() {
        const endpointMetrics = this.protocols.trackerServer.endpoint.getMetrics()
        const processMetrics = await this.metrics.getPidusage()
        const trackerMetrics = this.metrics.report()
        const mainMetrics = this.metrics.prettify(endpointMetrics)

        mainMetrics.id = this.opts.id

        return {
            trackerMetrics,
            mainMetrics,
            endpointMetrics,
            processMetrics
        }
    }
}
