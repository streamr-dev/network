import { EventEmitter } from 'events'
import { SmartContractRecord, StreamPartID, toStreamPartID } from 'streamr-client-protocol'
import { Logger } from '../../helpers/Logger'
import { Metrics, MetricsContext } from '../../helpers/MetricsContext'
import { TrackerServer, Event as TrackerServerEvent } from '../../protocol/TrackerServer'
import { OverlayTopology } from './OverlayTopology'
import { COUNTER_UNSUBSCRIBE, InstructionCounter } from './InstructionCounter'
import { LocationManager } from './LocationManager'
import { attachRtcSignalling } from './rtcSignallingHandlers'
import { PeerId, PeerInfo } from '../../connection/PeerInfo'
import { Location, Status, StreamPartStatus } from '../../identifiers'
import { TrackerLayer } from 'streamr-client-protocol'
import { NodeId } from '../node/Node'
import { InstructionSender } from './InstructionSender'

export type TrackerId = string

export enum Event {
    NODE_CONNECTED = 'streamr:tracker:node-connected'
}

export interface TopologyStabilizationOptions {
    debounceWait: number
    maxWait: number
}

export interface TrackerOptions {
    maxNeighborsPerNode: number
    peerInfo: PeerInfo
    protocols: {
        trackerServer: TrackerServer
    }
    metricsContext?: MetricsContext,
    topologyStabilization?: TopologyStabilizationOptions
}

export type OverlayPerStream = Record<StreamPartID, OverlayTopology>

// nodeId => connected nodeId => rtt
export type OverlayConnectionRtts = Record<NodeId,Record<NodeId,number>>

export interface Tracker {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this
}

export class Tracker extends EventEmitter {
    private readonly maxNeighborsPerNode: number
    private readonly trackerServer: TrackerServer
    /** @internal */
    public readonly peerInfo: PeerInfo
    private readonly overlayPerStream: OverlayPerStream
    private readonly overlayConnectionRtts: OverlayConnectionRtts
    private readonly locationManager: LocationManager
    private readonly instructionCounter: InstructionCounter
    private readonly instructionSender: InstructionSender
    private readonly extraMetadatas: Record<NodeId,Record<string, unknown>>
    private readonly logger: Logger
    private readonly metrics: Metrics
    private stopped = false

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

        this.logger = new Logger(module)
        this.overlayPerStream = {}
        this.overlayConnectionRtts = {}
        this.locationManager = new LocationManager()
        this.instructionCounter = new InstructionCounter()
        this.extraMetadatas = Object.create(null)

        this.trackerServer.on(TrackerServerEvent.NODE_CONNECTED, (nodeId) => {
            this.onNodeConnected(nodeId)
        })
        this.trackerServer.on(TrackerServerEvent.NODE_DISCONNECTED, (nodeId) => {
            this.onNodeDisconnected(nodeId)
        })
        this.trackerServer.on(TrackerServerEvent.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            this.processNodeStatus(statusMessage, nodeId)
        })
        attachRtcSignalling(this.trackerServer)

        this.metrics = metricsContext.create('tracker')
            .addRecordedMetric('onNodeDisconnected')
            .addRecordedMetric('processNodeStatus')
            .addRecordedMetric('_removeNode')

        this.instructionSender = new InstructionSender(
            opts.topologyStabilization,
            this.trackerServer.sendInstruction.bind(this.trackerServer),
            this.metrics
        )
    }

    onNodeConnected(node: NodeId): void {
        this.emit(Event.NODE_CONNECTED, node)
    }

    onNodeDisconnected(node: NodeId): void {
        this.logger.debug('node %s disconnected', node)
        this.metrics.record('onNodeDisconnected', 1)
        this.removeNode(node)
    }

    processNodeStatus(statusMessage: TrackerLayer.StatusMessage, source: NodeId): void {
        if (this.stopped) {
            return
        }

        this.metrics.record('processNodeStatus', 1)
        const status = statusMessage.status as Status
        const isMostRecent = this.instructionCounter.isMostRecent(status, source)
        if (!isMostRecent) {
            return
        }

        const { stream, rtts, location, extra } = status
        // update RTTs and location
        if (rtts) {
            this.overlayConnectionRtts[source] = rtts
        }
        this.locationManager.updateLocation({
            nodeId: source,
            location,
            address: this.trackerServer.resolveAddress(source),
        })
        this.extraMetadatas[source] = extra

        const streamPartId = toStreamPartID(stream.id, stream.partition)

        // update topology
        this.createTopology(streamPartId)
        this.updateNodeOnStream(source, stream)
        this.formAndSendInstructions(source, streamPartId)
    }

    async stop(): Promise<void> {
        this.logger.debug('stopping')

        this.instructionSender.stop()
        
        await this.trackerServer.stop()
        this.stopped = true
    }

    // Utility method for tests
    getUrl(): string {
        return this.trackerServer.getUrl()
    }

    private createTopology(streamPartId: StreamPartID) {
        if (this.overlayPerStream[streamPartId] == null) {
            this.overlayPerStream[streamPartId] = new OverlayTopology(this.maxNeighborsPerNode)
        }
    }

    private updateNodeOnStream(node: NodeId, status: StreamPartStatus): void {
        const streamPartId = toStreamPartID(status.id, status.partition)
        if (status.counter === COUNTER_UNSUBSCRIBE) {
            this.leaveAndCheckEmptyOverlay(streamPartId, this.overlayPerStream[streamPartId], node)
        } else {
            this.overlayPerStream[streamPartId].update(node, status.neighbors)
        }
    }

    private formAndSendInstructions(node: NodeId, streamPartId: StreamPartID, forceGenerate = false): void {
        if (this.stopped) {
            return
        }
        if (this.overlayPerStream[streamPartId]) {
            const instructions = this.overlayPerStream[streamPartId].formInstructions(node, forceGenerate)
            Object.entries(instructions).forEach(async ([nodeId, newNeighbors]) => {
                const counterValue = this.instructionCounter.setOrIncrement(nodeId, streamPartId)
                await this.instructionSender.addInstruction({
                    nodeId,
                    streamPartId,
                    newNeighbors,
                    counterValue
                })
            })
        }
    }

    private removeNode(node: NodeId): void {
        this.metrics.record('_removeNode', 1)
        delete this.overlayConnectionRtts[node]
        this.locationManager.removeNode(node)
        delete this.extraMetadatas[node]
        Object.entries(this.overlayPerStream)
            .forEach(([streamPartId, overlayTopology]) => {
                this.leaveAndCheckEmptyOverlay(streamPartId as StreamPartID, overlayTopology, node)
            })
    }

    private leaveAndCheckEmptyOverlay(streamPartId: StreamPartID, overlayTopology: OverlayTopology, node: NodeId) {
        const neighbors = overlayTopology.leave(node)
        this.instructionCounter.removeNode(node)

        if (overlayTopology.isEmpty()) {
            this.instructionCounter.removeStream(streamPartId)
            delete this.overlayPerStream[streamPartId]
        } else {
            neighbors.forEach((neighbor) => {
                this.formAndSendInstructions(neighbor, streamPartId, true)
            })
        }
    }

    getStreamParts(): Iterable<StreamPartID> {
        return Object.keys(this.overlayPerStream) as StreamPartID[]
    }

    getAllNodeLocations(): Readonly<Record<NodeId,Location>> {
        return this.locationManager.getAllNodeLocations()
    }

    getAllExtraMetadatas(): Readonly<Record<NodeId,Record<string, unknown>>> {
        return this.extraMetadatas
    }

    getNodes(): ReadonlyArray<NodeId> {
        return this.trackerServer.getNodeIds()
    }

    getNodeLocation(node: NodeId): Location {
        return this.locationManager.getNodeLocation(node)
    }

    getOverlayConnectionRtts(): OverlayConnectionRtts {
        return this.overlayConnectionRtts
    }

    getOverlayPerStream(): Readonly<OverlayPerStream> {
        return this.overlayPerStream
    }

    getConfigRecord(): SmartContractRecord {
        return {
            id: this.peerInfo.peerId,
            http: this.getUrl().replace(/^ws/, 'http'),
            ws: this.getUrl()
        }
    }

    getTrackerId(): PeerId {
        return this.peerInfo.peerId
    }
}
