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

        this.opts = {
            ...defaultOptions, ...opts
        }

        if (!(this.opts.protocols.trackerServer instanceof TrackerServer)) {
            throw new Error('Provided protocols are not correct')
        }

        this.overlayPerStream = {} // streamKey => overlayTopology, where streamKey = streamId::partition
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

        // Storage node may have restarted which means it will be no longer assigned to its previous streams,
        // especially those that aren't actively being subscribed or produced to. Thus on encountering a
        // unknown streamId, we need to create a new topology and assign storage node(s) to it to ensure
        // that resend requests for inactive streams get properly handled.
        if (this.storageNodes.size && this.overlayPerStream[streamId] == null) {
            this.overlayPerStream[streamId] = this._createNewOverlayTopology()
            this._formAndSendInstructionsToStorages()
        }

        const foundStorageNodes = []
        this.storageNodes.forEach((status, node) => {
            const streams = Object.keys(status.streams)
            if (streams.includes(streamId.key())) {
                foundStorageNodes.push(node)
            }
        })

        // TODO: this works for single storage node scenario. How to deal with multiple?
        if (!foundStorageNodes.length) {
            const randomStorage = this._getRandomStorage()

            if (randomStorage) {
                foundStorageNodes.push(randomStorage)
            }
        }

        this.protocols.trackerServer.sendStorageNodes(source, streamId, foundStorageNodes)
    }

    stop() {
        this.debug('stopping tracker')
        return this.protocols.trackerServer.stop()
    }

    getAddress() {
        return this.protocols.trackerServer.getAddress()
    }

    _getRandomStorage() {
        const listOfStorages = [...this.storageNodes.keys()]
        return listOfStorages[Math.floor(Math.random() * listOfStorages.length)]
    }

    _createNewOverlayTopology() {
        const overlayTopology = new OverlayTopology(this.opts.maxNeighborsPerNode)

        // add to the new OverlayTopology random storage
        if (this.storageNodes.size) {
            const randomStorage = this._getRandomStorage()

            if (randomStorage) {
                overlayTopology.update(this._getRandomStorage(), new Set())
            }
        }

        return overlayTopology
    }

    _updateNode(node, streams) {
        let newNode = true

        if (streams === {}) {
            this._removeNode(node)
            return
        }

        // Add or update
        Object.entries(streams).forEach(([streamKey, { inboundNodes, outboundNodes }]) => {
            if (this.overlayPerStream[streamKey] == null) {
                this.overlayPerStream[streamKey] = this._createNewOverlayTopology()
            }

            newNode = this.overlayPerStream[streamKey].hasNode(node) ? false : newNode

            const neighbors = new Set([...inboundNodes, ...outboundNodes])

            this.overlayPerStream[streamKey].update(node, neighbors)
        })

        // Remove
        const currentStreamKeys = new Set(Object.keys(streams))
        Object.entries(this.overlayPerStream)
            .filter(([streamKey, _]) => !currentStreamKeys.has(streamKey))
            .forEach(([streamKey, overlayTopology]) => this._leaveAndCheckEmptyOverlay(streamKey, overlayTopology, node))

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
                    this.metrics.inc('sendInstruction')
                    await this.protocols.trackerServer.sendInstruction(nodeId, StreamIdAndPartition.fromKey(streamKey), newNeighbors)
                    this.debug('sent instruction %j for stream %s to node %s', newNeighbors, streamKey, nodeId)
                } catch (e) {
                    this.metrics.inc('sendInstruction:failed')
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
                            this.metrics.inc('sendInstructionStorages')
                            await this.protocols.trackerServer.sendInstruction(storageNode, StreamIdAndPartition.fromKey(streamKey), [])
                            this.debug('sent instruction %j for stream %s to storage node %s', [], streamKey, storageNode)
                        } catch (e) {
                            this.metrics.inc('sendInstructionStorages:failed')
                            this.debug('failed to send instruction %j for stream %s to storage node %s because of %s', [], streamKey, storageNode, e)
                        }
                    })
                }
            })
        }
    }

    _removeNode(node) {
        this.metrics.inc('_removeNode')
        Object.entries(this.overlayPerStream)
            .forEach(([streamKey, overlayTopology]) => this._leaveAndCheckEmptyOverlay(streamKey, overlayTopology, node))
        this.debug('unregistered node %s from tracker', node)
    }

    _leaveAndCheckEmptyOverlay(streamKey, overlayTopology, node) {
        overlayTopology.leave(node)

        if (overlayTopology.isEmpty()) {
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
            if (streamId && partition) {
                askedStreamKey = new StreamIdAndPartition(streamId, parseInt(partition, 10))
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

    async getMetrics() {
        const endpointMetrics = this.protocols.trackerServer.basicProtocol.endpoint.getMetrics()
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
