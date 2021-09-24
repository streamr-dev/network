import { TrackerLayer, Utils } from 'streamr-client-protocol'
import { Status, StreamIdAndPartition, TrackerInfo } from '../identifiers'
import { TrackerId } from './Tracker'
import { TrackerConnector } from './TrackerConnector'
import { NodeToTracker, Event as NodeToTrackerEvent } from '../protocol/NodeToTracker'
import { StreamManager } from './StreamManager'
import { Logger } from '../helpers/Logger'
import { NodeId } from './Node'
import { InstructionThrottler } from './InstructionThrottler'
import { InstructionRetryManager } from './InstructionRetryManager'
import { Metrics } from '../helpers/MetricsContext'

const logger = new Logger(module)

type FormStatusFn = (streamId: StreamIdAndPartition, includeRtt: boolean) => Status

interface Subscriber {
    subscribeToStreamIfHaveNotYet: (streamId: StreamIdAndPartition, sendStatus?: boolean) => void
    subscribeToStreamsOnNode: (
        nodeIds: NodeId[],
        streamId: StreamIdAndPartition,
        trackerId: TrackerId,
        reattempt: boolean
    ) => Promise<PromiseSettledResult<NodeId>[]>,
    unsubscribeFromStreamOnNode: (node: NodeId, streamId: StreamIdAndPartition, sendStatus?: boolean) => void
}

export interface TrackerManagerOptions {
    trackers: Array<TrackerInfo>
    rttUpdateTimeout?: number
    trackerConnectionMaintenanceInterval?: number
    instructionRetryInterval?: number
}

export class TrackerManager {
    private readonly rttUpdateTimeoutsOnTrackers: Record<TrackerId, NodeJS.Timeout> = {}
    private readonly trackerRegistry: Utils.TrackerRegistry<TrackerInfo>
    private readonly trackerConnector: TrackerConnector
    private readonly formStatus: FormStatusFn
    private readonly nodeToTracker: NodeToTracker
    private readonly streamManager: StreamManager
    private readonly rttUpdateInterval: number
    private readonly instructionThrottler: InstructionThrottler
    private readonly instructionRetryManager: InstructionRetryManager
    private readonly metrics: Metrics
    private readonly subscriber: Subscriber

    constructor(
        nodeToTracker: NodeToTracker,
        formStatus: FormStatusFn,
        opts: TrackerManagerOptions,
        streamManager: StreamManager,
        metrics: Metrics,
        subscriber: Subscriber
    ) {
        this.trackerRegistry = Utils.createTrackerRegistry<TrackerInfo>(opts.trackers)
        this.formStatus = formStatus
        this.nodeToTracker =  nodeToTracker
        this.streamManager = streamManager
        this.rttUpdateInterval = opts.rttUpdateTimeout || 15000
        this.metrics = metrics
            .addRecordedMetric('unexpectedTrackerInstructions')
            .addRecordedMetric('trackerInstructions')
        this.subscriber = subscriber
        this.trackerConnector = new TrackerConnector(
            streamManager,
            this.nodeToTracker,
            this.trackerRegistry,
            opts.trackerConnectionMaintenanceInterval ?? 5000
        )

        this.instructionThrottler = new InstructionThrottler(this.handleTrackerInstruction.bind(this))
        this.instructionRetryManager = new InstructionRetryManager(
            this.handleTrackerInstruction.bind(this),
            opts.instructionRetryInterval || 3 * 60 * 1000
        )

        this.nodeToTracker.on(NodeToTrackerEvent.CONNECTED_TO_TRACKER, (trackerId) => {
            logger.trace('connected to tracker %s', trackerId)
            this.getStreamsForTracker(trackerId).forEach((streamId) => {
                this.sendStatus(streamId, trackerId)
            })
        })
        this.nodeToTracker.on(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED, (instructionMessage, trackerId) => {
            this.instructionThrottler.add(instructionMessage, trackerId)
        })
        this.nodeToTracker.on(NodeToTrackerEvent.TRACKER_DISCONNECTED, (trackerId) => {
            logger.trace('disconnected from tracker %s', trackerId)
        })
    }

    sendStreamStatus(streamId: StreamIdAndPartition): void {
        const trackerId = this.getTrackerId(streamId)
        this.sendStatus(streamId, trackerId)
    }

    onNewStream(streamId: StreamIdAndPartition): void {
        this.trackerConnector.onNewStream(streamId)
    }

    onUnsubscribeFromStream(streamId: StreamIdAndPartition): void {
        const key = streamId.key()
        this.instructionThrottler.removeStream(key)
        this.instructionRetryManager.removeStream(key)
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

    private getStreamsForTracker(trackerId: TrackerId): Array<StreamIdAndPartition> {
        return [...this.streamManager.getStreamKeys()]
            .map((key) => StreamIdAndPartition.fromKey(key))
            .filter((streamId) => this.getTrackerId(streamId) === trackerId)
    }

    private shouldIncludeRttInfo(trackerId: TrackerId): boolean {
        if (!(trackerId in this.rttUpdateTimeoutsOnTrackers)) {
            this.rttUpdateTimeoutsOnTrackers[trackerId] = setTimeout(() => {
                logger.trace(`RTT timeout to ${trackerId} triggered, RTTs to connections will be updated with the next status message`)
                delete this.rttUpdateTimeoutsOnTrackers[trackerId]
            }, this.rttUpdateInterval)
            return true
        }
        return false
    }

    private async sendStatus(streamId: StreamIdAndPartition, trackerId: TrackerId): Promise<void> {
        const status = this.formStatus(streamId, this.shouldIncludeRttInfo(trackerId))
        try {
            await this.nodeToTracker.sendStatus(trackerId, status)
            logger.trace('sent status %j to tracker %s', status.streams, trackerId)
        } catch (e) {
            logger.trace('failed to send status to tracker %s, reason: %s', trackerId, e)
        }
    }

    private async handleTrackerInstruction(
        instructionMessage: TrackerLayer.InstructionMessage,
        trackerId: TrackerId,
        reattempt = false
    ): Promise<void> {
        const streamId = StreamIdAndPartition.fromMessage(instructionMessage)
        const { nodeIds, counter } = instructionMessage

        this.instructionRetryManager.add(instructionMessage, trackerId)

        // Check that tracker matches expected tracker
        const expectedTrackerId = this.getTrackerId(streamId)
        if (trackerId !== expectedTrackerId) {
            this.metrics.record('unexpectedTrackerInstructions', 1)
            logger.warn(`got instructions from unexpected tracker. Expected ${expectedTrackerId}, got from ${trackerId}`)
            return
        }

        this.metrics.record('trackerInstructions', 1)
        logger.trace('received instructions for %s, nodes to connect %o', streamId, nodeIds)

        this.subscriber.subscribeToStreamIfHaveNotYet(streamId, false)
        const currentNodes = this.streamManager.getAllNodesForStream(streamId)
        const nodesToUnsubscribeFrom = currentNodes.filter((nodeId) => !nodeIds.includes(nodeId))

        nodesToUnsubscribeFrom.forEach((nodeId) => {
            this.subscriber.unsubscribeFromStreamOnNode(nodeId, streamId, false)
        })

        const results = await this.subscriber.subscribeToStreamsOnNode(nodeIds, streamId, trackerId, reattempt)
        if (this.streamManager.isSetUp(streamId)) {
            this.streamManager.updateCounter(streamId, counter)
        }

        // Log success / failures
        const subscribedNodeIds: NodeId[] = []
        const unsubscribedNodeIds: NodeId[] = []
        let failedInstructions = false
        results.forEach((res) => {
            if (res.status === 'fulfilled') {
                subscribedNodeIds.push(res.value)
            } else {
                failedInstructions = true
                logger.info('failed to subscribe (or connect) to node, reason: %s', res.reason)
            }
        })
        if (!reattempt || failedInstructions) {
            this.sendStreamStatus(streamId)
        }

        logger.trace('subscribed to %j and unsubscribed from %j (streamId=%s, counter=%d)',
            subscribedNodeIds, unsubscribedNodeIds, streamId, counter)

        if (subscribedNodeIds.length !== nodeIds.length) {
            logger.trace('error: failed to fulfill all tracker instructions (streamId=%s, counter=%d)', streamId, counter)
        } else {
            logger.trace('Tracker instructions fulfilled (streamId=%s, counter=%d)', streamId, counter)
        }
    }

    private getTrackerId(streamId: StreamIdAndPartition): TrackerId {
        return this.trackerRegistry.getTracker(streamId.id, streamId.partition).id
    }
}
