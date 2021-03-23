import { EventEmitter } from 'events'
import { Logger } from '../helpers/Logger'
import { Metrics, MetricsContext } from '../helpers/MetricsContext'
import { TrackerServer, Event as TrackerServerEvent } from '../protocol/TrackerServer'
import { OverlayTopology } from './OverlayTopology'
import { InstructionCounter } from './InstructionCounter'
import { LocationManager } from './LocationManager'
import { attachRtcSignalling } from './rtcSignallingHandlers'
import { PeerInfo } from '../connection/PeerInfo'
import { Location, Status, StatusStreams, StreamIdAndPartition, StreamKey } from '../identifiers'
import { TrackerLayer } from 'streamr-client-protocol'

type NodeId = string
type StreamId = string

export enum Event {
    NODE_CONNECTED = 'streamr:tracker:node-connected'
}

export interface TrackerOptions {
    maxNeighborsPerNode: number
    peerInfo: PeerInfo
    protocols: {
        trackerServer: TrackerServer
    }
    metricsContext?: MetricsContext
}

// streamKey => overlayTopology, where streamKey = streamId::partition
export type OverlayPerStream = { [key: string]: OverlayTopology }

// nodeId => connected nodeId => rtt
export type OverlayConnectionRtts = { [key: string]: { [key: string]: number } }

export interface Tracker {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this
}

export class Tracker extends EventEmitter {
    private readonly maxNeighborsPerNode: number
    private readonly trackerServer: TrackerServer
    private readonly peerInfo: PeerInfo
    private readonly overlayPerStream: OverlayPerStream
    private readonly overlayConnectionRtts: OverlayConnectionRtts
    private readonly locationManager: LocationManager
    private readonly instructionCounter: InstructionCounter
    private readonly storageNodes: Set<NodeId>
    private readonly logger: Logger
    private readonly metrics: Metrics

    constructor(opts: TrackerOptions) {
        super()

        if (!Number.isInteger(opts.maxNeighborsPerNode)) {
            throw new Error('maxNeighborsPerNode is not an integer')
        }
        if (!(opts.protocols.trackerServer instanceof TrackerServer)) {
            throw new Error('Provided protocols are not correct')
        }

        const metricsContext = opts.metricsContext || new MetricsContext('')
        this.maxNeighborsPerNode = opts.maxNeighborsPerNode
        this.trackerServer = opts.protocols.trackerServer
        this.peerInfo = opts.peerInfo

        this.logger = new Logger(['logic', 'Tracker'], this.peerInfo)
        this.overlayPerStream = {}
        this.overlayConnectionRtts = {}
        this.locationManager = new LocationManager(this.logger)
        this.instructionCounter = new InstructionCounter()
        this.storageNodes = new Set()

        this.trackerServer.on(TrackerServerEvent.NODE_CONNECTED, (nodeId, isStorage) => {
            this.onNodeConnected(nodeId, isStorage)
        })
        this.trackerServer.on(TrackerServerEvent.NODE_DISCONNECTED, (nodeId) => {
            this.onNodeDisconnected(nodeId)
        })
        this.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            this.processNodeStatus(statusMessage, nodeId)
        })
        this.trackerServer.on(TrackerServerEvent.STORAGE_NODES_REQUEST, (message, nodeId) => {
            this.findStorageNodes(message, nodeId)
        })
        attachRtcSignalling(this.logger, this.trackerServer)

        this.metrics = metricsContext.create('tracker')
            .addRecordedMetric('onNodeDisconnected')
            .addRecordedMetric('processNodeStatus')
            .addRecordedMetric('findStorageNodes')
            .addRecordedMetric('instructionsSent')
            .addRecordedMetric('_removeNode')
    }

    onNodeConnected(node: NodeId, isStorage: boolean): void {
        if (isStorage) {
            this.storageNodes.add(node)
        }
        this.emit(Event.NODE_CONNECTED, node)
    }

    onNodeDisconnected(node: NodeId): void {
        this.logger.debug('node %s disconnected', node)
        this.metrics.record('onNodeDisconnected', 1)
        this.removeNode(node)
    }

    processNodeStatus(statusMessage: TrackerLayer.StatusMessage, source: NodeId): void {
        this.metrics.record('processNodeStatus', 1)
        const status = statusMessage.status as Status
        const { streams, rtts, location, singleStream } = status
        const filteredStreams = this.instructionCounter.filterStatus(status, source)

        // update RTTs and location
        this.overlayConnectionRtts[source] = rtts
        this.locationManager.updateLocation({
            nodeId: source,
            location,
            address: this.trackerServer.resolveAddress(source),
        })

        // update topology
        this.createNewOverlayTopologies(streams)
        if (singleStream) {
            this.updateNodeOnStream(source, filteredStreams)
        } else {
            this.updateNode(source, filteredStreams, streams)
        }
        this.formAndSendInstructions(source, Object.keys(streams))
    }

    findStorageNodes(storageNodesRequest: TrackerLayer.StorageNodesRequest, source: NodeId): void {
        this.metrics.record('findStorageNodes', 1)
        const streamId = StreamIdAndPartition.fromMessage(storageNodesRequest)
        const storageNodeIds = [...this.storageNodes].filter((s) => s !== source)
        this.trackerServer.sendStorageNodesResponse(source, streamId, storageNodeIds)
            .catch((e) => {
                this.logger.error('Failed to send StorageNodesResponse to %s for stream %s, reason: %s',
                    source, streamId, e)
            })
    }

    stop(): Promise<void> {
        this.logger.debug('stopping')
        return this.trackerServer.stop()
    }

    getAddress(): string {
        return this.trackerServer.getAddress()
    }

    private createNewOverlayTopologies(streams: StatusStreams) {
        Object.keys(streams).forEach((streamId) => {
            if (this.overlayPerStream[streamId] == null) {
                this.overlayPerStream[streamId] = new OverlayTopology(this.maxNeighborsPerNode)
            }
        })
    }

    private updateNode(node: NodeId, filteredStreams: StatusStreams, allStreams: StatusStreams): void {
        // Add or update
        Object.entries(filteredStreams).forEach(([streamKey, { inboundNodes, outboundNodes }]) => {
            const neighbors = new Set([...inboundNodes, ...outboundNodes])
            this.overlayPerStream[streamKey].update(node, [...neighbors])
        })

        // Remove
        const currentStreamKeys: Set<StreamKey> = new Set(Object.keys(allStreams))
        Object.entries(this.overlayPerStream)
            .filter(([streamKey, _]) => !currentStreamKeys.has(streamKey))
            .forEach(([streamKey, overlayTopology]) => {
                this.leaveAndCheckEmptyOverlay(streamKey, overlayTopology, node)
            })
    }

    private updateNodeOnStream(node: NodeId, streams: StatusStreams): void {
        if (streams && Object.keys(streams).length === 1) {
            const streamKey = Object.keys(streams)[0]
            const status = streams[streamKey]
            if (status.counter === -1) {
                this.leaveAndCheckEmptyOverlay(streamKey, this.overlayPerStream[streamKey], node)
            } else {
                const neighbors = new Set([...status.inboundNodes, ...status.outboundNodes])
                this.overlayPerStream[streamKey].update(node, [...neighbors])
            }
        } else {
            this.logger.warn('unexpected empty single-stream status received from node %s, contents %j', node, streams)
        }
    }

    private formAndSendInstructions(node: NodeId, streamKeys: Array<StreamKey>, forceGenerate = false): void {
        streamKeys.forEach((streamKey) => {
            if (this.overlayPerStream[streamKey]) {
                const instructions = this.overlayPerStream[streamKey].formInstructions(node, forceGenerate)
                Object.entries(instructions).forEach(async ([nodeId, newNeighbors]) => {
                    this.metrics.record('instructionsSent', 1)
                    try {
                        const counterValue = this.instructionCounter.setOrIncrement(nodeId, streamKey)
                        await this.trackerServer.sendInstruction(
                            nodeId,
                            StreamIdAndPartition.fromKey(streamKey),
                            newNeighbors,
                            counterValue
                        )
                        this.logger.debug('instruction %j (counter=%d, stream=%s, requestId=%s) sent to node %s',
                            newNeighbors, counterValue, streamKey, nodeId)
                    } catch (e) {
                        this.logger.error(`Failed to send instructions (stream=%s) to node %s, reason: %s`,
                            streamKey, nodeId, e)
                    }
                })
            }
        })
    }

    private removeNode(node: NodeId): void {
        this.metrics.record('_removeNode', 1)
        this.storageNodes.delete(node)
        delete this.overlayConnectionRtts[node]
        this.locationManager.removeNode(node)
        Object.entries(this.overlayPerStream)
            .forEach(([streamKey, overlayTopology]) => {
                this.leaveAndCheckEmptyOverlay(streamKey, overlayTopology, node)
            })
    }

    private leaveAndCheckEmptyOverlay(streamKey: StreamKey, overlayTopology: OverlayTopology, node: NodeId) {
        const neighbors = overlayTopology.leave(node)
        this.instructionCounter.removeNode(node)

        if (overlayTopology.isEmpty()) {
            this.instructionCounter.removeStream(streamKey)
            delete this.overlayPerStream[streamKey]
        } else {
            neighbors.forEach((neighbor) => {
                this.formAndSendInstructions(neighbor, [streamKey], true)
            })
        }
    }

    getStreams(): ReadonlyArray<StreamId> {
        return Object.keys(this.overlayPerStream)
    }

    getAllNodeLocations(): Readonly<{[key: string]: Location}> {
        return this.locationManager.getAllNodeLocations()
    }

    getNodes(): ReadonlyArray<string> {
        return this.trackerServer.getNodeIds()
    }

    getNodeLocation(node: NodeId): Location {
        return this.locationManager.getNodeLocation(node)
    }

    getOverlayConnectionRtts(): { [key: string]: { [key: string]: number } } {
        return this.overlayConnectionRtts
    }

    getStorageNodes(): ReadonlyArray<NodeId> {
        return [...this.storageNodes]
    }

    getOverlayPerStream(): Readonly<OverlayPerStream> {
        return this.overlayPerStream
    }
}
