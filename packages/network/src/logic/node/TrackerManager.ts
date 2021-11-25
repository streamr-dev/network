import { SPID, TrackerLayer, Utils } from 'streamr-client-protocol'
import { Location, Rtts, TrackerInfo } from '../../identifiers'
import { TrackerId } from '../tracker/Tracker'
import { TrackerConnector } from './TrackerConnector'
import { NodeToTracker, Event as NodeToTrackerEvent } from '../../protocol/NodeToTracker'
import { StreamManager } from './StreamManager'
import { Logger } from '../../helpers/Logger'
import { NodeId } from './Node'
import { InstructionThrottler } from './InstructionThrottler'
import { InstructionRetryManager } from './InstructionRetryManager'
import { Metrics } from '../../helpers/MetricsContext'
import { NameDirectory } from '../../NameDirectory'

const logger = new Logger(module)

interface NodeDescriptor {
    started: string
    location: Location
    extra: Record<string, unknown>
    rtts: Readonly<Rtts> | null
}

interface Subscriber {
    subscribeToStreamIfHaveNotYet: (spid: SPID, sendStatus?: boolean) => void
    subscribeToStreamsOnNode: (
        nodeIds: NodeId[],
        spid: SPID,
        trackerId: TrackerId,
        reattempt: boolean
    ) => Promise<PromiseSettledResult<NodeId>[]>,
    unsubscribeFromStreamOnNode: (node: NodeId, spid: SPID, sendStatus?: boolean) => void
}

type GetNodeDescriptor = (includeRtt: boolean) => NodeDescriptor

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
    private readonly nodeToTracker: NodeToTracker
    private readonly streamManager: StreamManager
    private readonly rttUpdateInterval: number
    private readonly instructionThrottler: InstructionThrottler
    private readonly instructionRetryManager: InstructionRetryManager
    private readonly metrics: Metrics
    private readonly getNodeDescriptor: GetNodeDescriptor
    private readonly subscriber: Subscriber

    constructor(
        nodeToTracker: NodeToTracker,
        opts: TrackerManagerOptions,
        streamManager: StreamManager,
        metrics: Metrics,
        getNodeDescriptor: GetNodeDescriptor,
        subscriber: Subscriber
    ) {
        this.nodeToTracker =  nodeToTracker
        this.streamManager = streamManager
        this.trackerRegistry = Utils.createTrackerRegistry<TrackerInfo>(opts.trackers)
        this.metrics = metrics
            .addRecordedMetric('unexpectedTrackerInstructions')
            .addRecordedMetric('trackerInstructions')
        this.getNodeDescriptor = getNodeDescriptor
        this.subscriber = subscriber
        this.rttUpdateInterval = opts.rttUpdateTimeout || 15000
        this.trackerConnector = new TrackerConnector(
            streamManager.getSPIDs.bind(streamManager),
            this.nodeToTracker.connectToTracker.bind(this.nodeToTracker),
            this.nodeToTracker.disconnectFromTracker.bind(this.nodeToTracker),
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
            this.getStreamsForTracker(trackerId).forEach((spid) => {
                this.sendStatus(spid, trackerId)
            })
        })
        this.nodeToTracker.on(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED, (instructionMessage, trackerId) => {
            this.instructionThrottler.add(instructionMessage, trackerId)
        })
        this.nodeToTracker.on(NodeToTrackerEvent.TRACKER_DISCONNECTED, (trackerId) => {
            logger.trace('disconnected from tracker %s', trackerId)
        })
    }

    sendStreamStatus(spid: SPID): void {
        const trackerId = this.getTrackerId(spid)
        this.sendStatus(spid, trackerId)
    }

    onNewStream(spid: SPID): void {
        this.trackerConnector.onNewStream(spid)
    }

    async connectToTrackerForStream(spid: SPID): Promise<void> {
        await this.trackerConnector.createTrackerConnectionForStream(spid)
    }

    onUnsubscribeFromStream(spid: SPID): void {
        const key = spid.toKey()
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
        return this.nodeToTracker.stop()
    }

    private getStreamsForTracker(trackerId: TrackerId): Array<SPID> {
        return [...this.streamManager.getSPIDKeys()]
            .map((key) => SPID.from(key))
            .filter((spid) => this.getTrackerId(spid) === trackerId)
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

    private async sendStatus(spid: SPID, trackerId: TrackerId): Promise<void> {
        if (!this.streamManager.isOneDirectional(spid)) {
            const nodeDescriptor = this.getNodeDescriptor(this.shouldIncludeRttInfo(trackerId))
            const status = {
                stream: this.streamManager.getStreamStatus(spid),
                ...nodeDescriptor
            }
            try {
                await this.nodeToTracker.sendStatus(trackerId, status)
                logger.trace('sent status %j to tracker %s', status.stream, trackerId)
            } catch (e) {
                logger.trace('failed to send status to tracker %s, reason: %s', trackerId, e)
            }
        }
    }

    private async handleTrackerInstruction(
        instructionMessage: TrackerLayer.InstructionMessage,
        trackerId: TrackerId,
        reattempt = false
    ): Promise<void> {
        const spid = instructionMessage.getSPID()
        const { nodeIds, counter } = instructionMessage

        this.instructionRetryManager.add(instructionMessage, trackerId)

        // Check that tracker matches expected tracker
        const expectedTrackerId = this.getTrackerId(spid)
        if (trackerId !== expectedTrackerId) {
            this.metrics.record('unexpectedTrackerInstructions', 1)
            logger.warn(`got instructions from unexpected tracker. Expected ${expectedTrackerId}, got from ${trackerId}`)
            return
        }

        this.metrics.record('trackerInstructions', 1)
        logger.trace('received instructions for %s, nodes to connect %o', spid, nodeIds)

        this.subscriber.subscribeToStreamIfHaveNotYet(spid, false)
        const currentNodes = this.streamManager.getNeighborsForStream(spid)
        const nodesToUnsubscribeFrom = currentNodes.filter((nodeId) => !nodeIds.includes(nodeId))

        nodesToUnsubscribeFrom.forEach((nodeId) => {
            this.subscriber.unsubscribeFromStreamOnNode(nodeId, spid, false)
        })

        const results = await this.subscriber.subscribeToStreamsOnNode(nodeIds, spid, trackerId, reattempt)
        if (this.streamManager.isSetUp(spid)) {
            this.streamManager.updateCounter(spid, counter)
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
                logger.debug('failed to subscribe (or connect) to %s, reason: %s', NameDirectory.getName(nodeIds[i]), res.reason)
            }
        })
        if (!reattempt || failedInstructions) {
            this.sendStreamStatus(spid)
        }

        logger.trace('subscribed to %j and unsubscribed from %j (streamId=%s, counter=%d)',
            subscribedNodeIds, unsubscribedNodeIds, spid, counter)

        if (subscribedNodeIds.length !== nodeIds.length) {
            logger.trace('error: failed to fulfill all tracker instructions (streamId=%s, counter=%d)', spid, counter)
        } else {
            logger.trace('Tracker instructions fulfilled (streamId=%s, counter=%d)', spid, counter)
        }
    }

    getTrackerId(spid: SPID): TrackerId {
        return this.trackerRegistry.getTracker(spid).id
    }
}
