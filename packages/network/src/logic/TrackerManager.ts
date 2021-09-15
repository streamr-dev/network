import { Status, StreamIdAndPartition, TrackerInfo } from '../identifiers'
import { TrackerId } from './Tracker'
import { TrackerConnector } from './TrackerConnector'
import { NodeToTracker } from '../protocol/NodeToTracker'
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
        nodeToTracker: NodeToTracker,
        streamManager: StreamManager,
    ) {
        this.trackerRegistry = Utils.createTrackerRegistry<TrackerInfo>(opts.trackers)
        this.trackerConnector = new TrackerConnector(
            streamManager,
            nodeToTracker,
            this.trackerRegistry,
            opts.trackerConnectionMaintenanceInterval ?? 5000
        )
        this.formStatus = formStatus
        this.nodeToTracker = nodeToTracker
        this.streamManager = streamManager
        this.rttUpdateInterval = opts.rttUpdateTimeout || 15000
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

    onConnectedToTracker(trackerId: TrackerId): void {
        logger.trace('connected to tracker %s', trackerId)
        this.prepareAndSendMultipleStatuses(trackerId)
    }

    onNewStream(streamId: StreamIdAndPartition): void {
        this.trackerConnector.onNewStream(streamId)
    }

    start(): void {
        this.trackerConnector.start()
    }

    stop(): void {
        this.trackerConnector.stop()
        Object.values(this.rttUpdateTimeoutsOnTrackers).forEach((timeout) => clearTimeout(timeout))
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
