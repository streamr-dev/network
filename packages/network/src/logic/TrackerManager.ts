import { Status, StreamIdAndPartition, TrackerInfo } from '../identifiers'
import { TrackerId } from './Tracker'
import { TrackerConnector } from './TrackerConnector'
import { NodeToTracker } from '../protocol/NodeToTracker'
import { StreamManager } from './StreamManager'
import { Logger } from '../helpers/Logger'
import { NodeOptions } from './Node'
import { Utils } from 'streamr-client-protocol'

type FormStatusFn = (streamId: StreamIdAndPartition, includeRtt: boolean) => Status

export class TrackerManager {
    private readonly rttUpdateTimeoutsOnTrackers: Record<TrackerId, NodeJS.Timeout> = {}
    private readonly trackerRegistry: Utils.TrackerRegistry<TrackerInfo>
    private readonly trackerConnector: TrackerConnector
    private readonly formStatus: FormStatusFn
    private readonly nodeToTracker: NodeToTracker
    private readonly streamManager: StreamManager
    private readonly logger: Logger
    private readonly rttUpdateInterval: number

    constructor(
        formStatus: FormStatusFn,
        opts: NodeOptions,
        logger: Logger,
        nodeToTracker: NodeToTracker,
        streamManager: StreamManager,
    ) {
        this.trackerRegistry = Utils.createTrackerRegistry<TrackerInfo>(opts.trackers)
        this.trackerConnector = new TrackerConnector(
            streamManager,
            nodeToTracker,
            this.trackerRegistry,
            logger,
            opts.trackerConnectionMaintenanceInterval ?? 5000
        )
        this.formStatus = formStatus
        this.nodeToTracker = nodeToTracker
        this.streamManager = streamManager
        this.logger = logger
        this.rttUpdateInterval = opts.rttUpdateTimeout || 15000
    }

    prepareAndSendStreamStatus(streamId: StreamIdAndPartition): void {
        const trackerId = this.getTrackerId(streamId)
        const status = this.getStreamStatus(streamId, trackerId)
        this.sendStatus(trackerId, status)
    }

    prepareAndSendMultipleStatuses(trackerId: TrackerId, streams?: StreamIdAndPartition[]): void {
        const listOfStatus = this.getMultipleStatus(trackerId, streams)
        listOfStatus.forEach((status) => {
            this.sendStatus(trackerId, status)
        })
    }

    getTrackerId(streamId: StreamIdAndPartition): TrackerId {
        return this.trackerRegistry.getTracker(streamId.id, streamId.partition).id
    }

    onConnectedToTracker(trackerId: TrackerId): void {
        // TODO: add guard for connectivity if deemed necessary
        this.logger.trace('connected to tracker %s', trackerId)
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

    // Gets statuses of all streams assigned to a tracker by default
    private getMultipleStatus(tracker: TrackerId, explicitStreams?: StreamIdAndPartition[]): Status[] {
        const streams = explicitStreams || this.streamManager.getStreams()
        return streams
            .filter((streamId) => this.getTrackerId(streamId) === tracker) // TODO: is this check necessary? internal business
            .map((streamId) => this.getStreamStatus(streamId, tracker))
    }

    private getStreamStatus(streamId: StreamIdAndPartition, trackerId: TrackerId): Status {
        return this.formStatus(streamId, this.shouldIncludeRttInfo(trackerId))
    }

    private shouldIncludeRttInfo(trackerId: TrackerId): boolean {
        if (!(trackerId in this.rttUpdateTimeoutsOnTrackers)) {
            this.rttUpdateTimeoutsOnTrackers[trackerId] = setTimeout(() => {
                this.logger.trace(`RTT timeout to ${trackerId} triggered, RTTs to connections will be updated with the next status message`)
                delete this.rttUpdateTimeoutsOnTrackers[trackerId]
            }, this.rttUpdateInterval)
            return true
        }
        return false
    }

    private async sendStatus(tracker: TrackerId, status: Status) {
        try {
            await this.nodeToTracker.sendStatus(tracker, status)
            this.logger.trace('sent status %j to tracker %s', status.streams, tracker)
        } catch (e) {
            this.logger.trace('failed to send status to tracker %s, reason: %s', tracker, e)
        }
    }
}
