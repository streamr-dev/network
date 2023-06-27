import {
    createTrackerRegistry,
    InstructionMessage,
    TrackerRegistryRecord,
    StreamPartID,
    TrackerRegistry
} from '@streamr/protocol'
import { Location, Rtts, NodeId, TrackerId } from '../identifiers'
import { TrackerConnector } from './TrackerConnector'
import { NodeToTracker, Event as NodeToTrackerEvent } from '../protocol/NodeToTracker'
import { StreamPartManager } from './StreamPartManager'
import { Logger } from "@streamr/utils"
import { InstructionThrottler } from './InstructionThrottler'
import { InstructionRetryManager } from './InstructionRetryManager'
import { NameDirectory } from '../NameDirectory'

const logger = new Logger(module)

interface NodeDescriptor {
    started: string
    location?: Location
    extra: Record<string, unknown>
    rtts: Readonly<Rtts> | null
}

interface Subscriber {
    subscribeToStreamPartOnNodes: (
        nodeIds: NodeId[],
        streamPartId: StreamPartID,
        trackerId: TrackerId,
        reattempt: boolean
    ) => Promise<PromiseSettledResult<NodeId>[]>
    unsubscribeFromStreamPartOnNode: (node: NodeId, streamPartId: StreamPartID, sendStatus?: boolean) => void
    emitJoinCompleted: (streamPartId: StreamPartID, numOfNeighbors: number) => void
    emitJoinFailed: (streamPartId: StreamPartID, error: string) => void
}

type GetNodeDescriptor = (includeRtt: boolean) => NodeDescriptor

export interface TrackerManagerOptions {
    trackers: Array<TrackerRegistryRecord>
    rttUpdateTimeout: number
    trackerConnectionMaintenanceInterval: number
    instructionRetryInterval?: number
}

export class TrackerManager {
    private readonly rttUpdateTimeoutsOnTrackers: Record<TrackerId, NodeJS.Timeout> = {}
    private readonly trackerRegistry: TrackerRegistry<TrackerRegistryRecord>
    private readonly trackerConnector: TrackerConnector
    private readonly nodeToTracker: NodeToTracker
    private readonly streamPartManager: StreamPartManager
    private readonly rttUpdateInterval: number
    private readonly instructionThrottler: InstructionThrottler
    private readonly instructionRetryManager: InstructionRetryManager
    private readonly getNodeDescriptor: GetNodeDescriptor
    private readonly subscriber: Subscriber

    constructor(
        nodeToTracker: NodeToTracker,
        opts: TrackerManagerOptions,
        streamPartManager: StreamPartManager,
        getNodeDescriptor: GetNodeDescriptor,
        subscriber: Subscriber
    ) {
        this.nodeToTracker = nodeToTracker
        this.streamPartManager = streamPartManager
        this.trackerRegistry = createTrackerRegistry<TrackerRegistryRecord>(opts.trackers)
        this.getNodeDescriptor = getNodeDescriptor
        this.subscriber = subscriber
        this.rttUpdateInterval = opts.rttUpdateTimeout
        this.trackerConnector = new TrackerConnector(
            streamPartManager.getStreamParts.bind(streamPartManager),
            this.nodeToTracker.connectToTracker.bind(this.nodeToTracker),
            this.nodeToTracker.disconnectFromTracker.bind(this.nodeToTracker),
            this.trackerRegistry,
            opts.trackerConnectionMaintenanceInterval
        )

        this.instructionThrottler = new InstructionThrottler(this.handleTrackerInstruction.bind(this))
        this.instructionRetryManager = new InstructionRetryManager(
            this.handleTrackerInstruction.bind(this),
            opts.instructionRetryInterval || 3 * 60 * 1000
        )

        this.nodeToTracker.on(NodeToTrackerEvent.CONNECTED_TO_TRACKER, (trackerId) => {
            logger.trace('Connected to tracker', { trackerId })
            this.getStreamPartsForTracker(trackerId).forEach((streamPart) => {
                this.sendStatus(streamPart, trackerId)
            })
        })
        this.nodeToTracker.on(NodeToTrackerEvent.STATUS_ACK_RECEIVED, (statusAckMessage) => {
            const streamPartId = statusAckMessage.getStreamPartID()
            if (this.streamPartManager.isSetUp(streamPartId) && this.streamPartManager.isNewStream(streamPartId)) {
                this.subscriber.emitJoinCompleted(streamPartId, 0)
            }
        })
        this.nodeToTracker.on(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED, (instructionMessage, trackerId) => {
            this.instructionThrottler.add(instructionMessage, trackerId)
        })
        this.nodeToTracker.on(NodeToTrackerEvent.TRACKER_DISCONNECTED, (trackerId) => {
            logger.trace('Disconnected from tracker', { trackerId })
        })
    }

    sendStreamPartStatus(streamPartId: StreamPartID): void {
        const trackerId = this.getTrackerId(streamPartId)
        this.sendStatus(streamPartId, trackerId)
    }

    onNewStreamPart(streamPartId: StreamPartID): void {
        this.trackerConnector.onNewStreamPart(streamPartId)
    }

    async addSignallingOnlySession(streamPartId: StreamPartID, nodeToSignal: NodeId): Promise<void> {
        await this.trackerConnector.addSignallingOnlySession(streamPartId, nodeToSignal)
    }

    removeSignallingOnlySession(streamPartId: StreamPartID, nodeToSignal: NodeId): void {
        this.trackerConnector.removeSignallingOnlySession(streamPartId, nodeToSignal)
    }

    onUnsubscribeFromStreamPart(streamPartId: StreamPartID): void {
        this.instructionThrottler.removeStreamPart(streamPartId)
        this.instructionRetryManager.removeStreamPart(streamPartId)
    }

    start(): void {
        this.trackerConnector.start()
    }

    async stop(): Promise<void> {
        this.instructionThrottler.stop()
        this.instructionRetryManager.stop()
        this.trackerConnector.stop()
        Object.values(this.rttUpdateTimeoutsOnTrackers).forEach((timeout) => clearTimeout(timeout))
        await this.nodeToTracker.stop()
    }

    private getStreamPartsForTracker(trackerId: TrackerId): Array<StreamPartID> {
        return [...this.streamPartManager.getStreamParts()]
            .filter((streamPartId) => this.getTrackerId(streamPartId) === trackerId)
    }

    private shouldIncludeRttInfo(trackerId: TrackerId): boolean {
        if (!(trackerId in this.rttUpdateTimeoutsOnTrackers)) {
            this.rttUpdateTimeoutsOnTrackers[trackerId] = setTimeout(() => {
                logger.trace('Triggered RTT update timeout to tracker', { trackerId })
                delete this.rttUpdateTimeoutsOnTrackers[trackerId]
            }, this.rttUpdateInterval)
            return true
        }
        return false
    }

    private async sendStatus(streamPartId: StreamPartID, trackerId: TrackerId): Promise<void> {
        if (!this.streamPartManager.isBehindProxy(streamPartId)) {
            const nodeDescriptor = this.getNodeDescriptor(this.shouldIncludeRttInfo(trackerId))
            const status = {
                streamPart: this.streamPartManager.getStreamPartStatus(streamPartId),
                ...nodeDescriptor
            }
            try {
                await this.nodeToTracker.sendStatus(trackerId, status)
                logger.trace('Sent status to tracker', {
                    streamPartId: status.streamPart,
                    trackerId
                })
            } catch (err) {
                logger.trace('Failed to send status to tracker', { err, trackerId })
            }
        }
    }

    private async handleTrackerInstruction(
        instructionMessage: InstructionMessage,
        trackerId: TrackerId,
        reattempt = false
    ): Promise<void> {
        const streamPartId = instructionMessage.getStreamPartID()
        if (!this.streamPartManager.isSetUp(streamPartId)) {
            return
        }

        const { nodeIds, counter } = instructionMessage
        this.instructionRetryManager.add(instructionMessage, trackerId)

        // Check that tracker matches expected tracker
        const expectedTrackerId = this.getTrackerId(streamPartId)
        if (trackerId !== expectedTrackerId) {
            logger.warn('Received instructions from unexpected tracker', {
                expectedTrackerId,
                trackerId
            })
            return
        }

        logger.trace('Receive instructions', { streamPartId, nodeIds })

        const currentNodes = this.streamPartManager.getNeighborsForStreamPart(streamPartId)

        const nodesToUnsubscribeFrom = currentNodes.filter((nodeId) => !nodeIds.includes(nodeId))

        nodesToUnsubscribeFrom.forEach((nodeId) => {
            this.subscriber.unsubscribeFromStreamPartOnNode(nodeId, streamPartId, false)
        })

        const results = await this.subscriber.subscribeToStreamPartOnNodes(nodeIds, streamPartId, trackerId, reattempt)
        let newStream = false
        if (this.streamPartManager.isSetUp(streamPartId)) {
            newStream = this.streamPartManager.isNewStream(streamPartId)
            this.streamPartManager.updateCounter(streamPartId, counter)
        }

        // Log success / failures
        const subscribedNodeIds: NodeId[] = []
        const unsubscribedNodeIds: NodeId[] = []
        let failedInstructions = false
        results.forEach((res, i) => {
            if (res.status === 'fulfilled') {
                subscribedNodeIds.push(res.value)
            } else {
                failedInstructions = true
                logger.debug('Failed to subscribe to node', {
                    nodeId: NameDirectory.getName(nodeIds[i]),
                    reason: res.reason
                })
            }
        })
        if (!reattempt || failedInstructions) {
            this.sendStreamPartStatus(streamPartId)
        }

        if (newStream) {
            if (subscribedNodeIds.length === 0) {
                this.subscriber.emitJoinFailed(streamPartId,
                    `Failed initial join operation to stream partition ${streamPartId}, failed to form connections to all target neighbors`
                )
            } else {
                this.subscriber.emitJoinCompleted(streamPartId, subscribedNodeIds.length)
            }
        }

        logger.trace('Fulfilled tracker instructions', {
            subscribedNodeIds,
            unsubscribedNodeIds,
            streamPartId,
            counter,
            fullFilledAll: subscribedNodeIds.length === nodeIds.length
        })
    }

    getTrackerId(streamPartId: StreamPartID): TrackerId {
        return this.trackerRegistry.getTracker(streamPartId).id
    }

    getTrackerAddress(streamPartId: StreamPartID): TrackerId {
        return this.trackerRegistry.getTracker(streamPartId).ws
    }

    getDiagnosticInfo(): Record<string, unknown> {
        return this.nodeToTracker.getDiagnosticInfo()
    }
}
