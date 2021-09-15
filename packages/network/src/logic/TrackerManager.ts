import { TrackerLayer } from 'streamr-client-protocol'
import { Status, StreamIdAndPartition, TrackerInfo } from '../identifiers'
import { TrackerId } from './Tracker'
import { TrackerConnector } from './TrackerConnector'
import { NodeToTracker, Event as NodeToTrackerEvent } from '../protocol/NodeToTracker'
import { StreamManager } from './StreamManager'
import { Logger } from '../helpers/Logger'
import { NodeOptions } from './Node'
import { Utils } from 'streamr-client-protocol'

const logger = new Logger(module)

type FormStatusFn = (streamId: StreamIdAndPartition, includeRtt: boolean) => Status

export class TrackerManager {
    private readonly rttUpdateTimeoutsOnTrackers: Record<TrackerId, NodeJS.Timeout> = {}
    private readonly trackerRegistry: Utils.TrackerRegistry<TrackerInfo>
    private readonly trackerConnector: TrackerConnector
    private readonly formStatus: FormStatusFn
    private readonly nodeToTracker: NodeToTracker
    private readonly streamManager: StreamManager
    private readonly rttUpdateInterval: number

    constructor(
        formStatus: FormStatusFn,
        opts: NodeOptions,
        streamManager: StreamManager,
        onTrackerInstructionReceived: (trackerId: TrackerId, instructionMessage: TrackerLayer.InstructionMessage) => void
    ) {
        this.trackerRegistry = Utils.createTrackerRegistry<TrackerInfo>(opts.trackers)
        this.formStatus = formStatus
        this.nodeToTracker =  opts.protocols.nodeToTracker
        this.streamManager = streamManager
        this.rttUpdateInterval = opts.rttUpdateTimeout || 15000
        this.trackerConnector = new TrackerConnector(
            streamManager,
            this.nodeToTracker,
            this.trackerRegistry,
            opts.trackerConnectionMaintenanceInterval ?? 5000
        )

        this.nodeToTracker.on(NodeToTrackerEvent.CONNECTED_TO_TRACKER, (trackerId) => {
            logger.trace('connected to tracker %s', trackerId)
            this.prepareAndSendMultipleStatuses(trackerId)
        })
        this.nodeToTracker.on(NodeToTrackerEvent.TRACKER_INSTRUCTION_RECEIVED, (streamMessage, trackerId) => {
            onTrackerInstructionReceived(trackerId, streamMessage)
        })
        this.nodeToTracker.on(NodeToTrackerEvent.TRACKER_DISCONNECTED, (trackerId) => {
            logger.trace('disconnected from tracker %s', trackerId)
        })
    }

    prepareAndSendStreamStatus(streamId: StreamIdAndPartition): void {
        const trackerId = this.getTrackerId(streamId)
        this.sendStatus(streamId, trackerId)
    }

    prepareAndSendMultipleStatuses(trackerId: TrackerId): void {
        const relevantStreams = this.getStreamsForTracker(trackerId)
        relevantStreams.forEach((streamId) => {
            this.sendStatus(streamId, trackerId)
        })
    }

    getTrackerId(streamId: StreamIdAndPartition): TrackerId {
        return this.trackerRegistry.getTracker(streamId.id, streamId.partition).id
    }

    onNewStream(streamId: StreamIdAndPartition): void {
        this.trackerConnector.onNewStream(streamId)
    }

    start(): void {
        this.trackerConnector.start()
    }

    async stop(): Promise<void> {
        this.trackerConnector.stop()
        Object.values(this.rttUpdateTimeoutsOnTrackers).forEach((timeout) => clearTimeout(timeout))
        await this.nodeToTracker.stop()
    }

    private getStreamsForTracker(trackerId: TrackerId): Array<StreamIdAndPartition> {
        return [...this.streamManager.getStreamKeys()].map((key) => StreamIdAndPartition.fromKey(key))
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

    private async sendStatus(streamId: StreamIdAndPartition, trackerId: TrackerId) {
        const status = this.formStatus(streamId, this.shouldIncludeRttInfo(trackerId))
        try {
            await this.nodeToTracker.sendStatus(trackerId, status)
            logger.trace('sent status %j to tracker %s', status.streams, trackerId)
        } catch (e) {
            logger.trace('failed to send status to tracker %s, reason: %s', trackerId, e)
        }
    }
}
