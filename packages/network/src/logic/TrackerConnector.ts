import { Utils } from 'streamr-client-protocol'
import { StreamIdAndPartition, TrackerInfo } from '../identifiers'
import { NodeToTracker } from '../protocol/NodeToTracker'
import { Logger } from '../helpers/Logger'
import { PeerInfo } from '../connection/PeerInfo'
import { TrackerId } from './Tracker'
import { StreamManager } from './StreamManager'

export class TrackerConnector {

    private readonly streamManager: StreamManager
    private readonly nodeToTracker: NodeToTracker
    private readonly trackerRegistry: Utils.TrackerRegistry<TrackerInfo>
    private readonly logger: Logger
    private maintenanceTimer?: NodeJS.Timeout | null
    private readonly maintenanceInterval: number
    private unconnectables: Set<TrackerId>

    constructor(streamManager: StreamManager, nodeToTracker: NodeToTracker, trackerRegistry: Utils.TrackerRegistry<TrackerInfo>, logger: Logger, maintenanceInterval: number) {
        this.streamManager = streamManager
        this.nodeToTracker = nodeToTracker
        this.trackerRegistry = trackerRegistry
        this.logger = logger
        this.maintenanceInterval = maintenanceInterval
        this.unconnectables = new Set()
    }

    maintainConnections(): void {
        this.trackerRegistry.getAllTrackers().forEach((trackerInfo) => {
            if (this.isActiveTracker(trackerInfo.id)) {
                this.connectTo(trackerInfo)
            } else {
                this.nodeToTracker.disconnectFromTracker(trackerInfo.id)
            }
        })
    }

    onNewStream(streamId: StreamIdAndPartition) {
        const trackerInfo = this.trackerRegistry.getTracker(streamId.id, streamId.partition)
        this.connectTo(trackerInfo)
    }

    start(): void {
        this.maintainConnections()
        this.maintenanceTimer = setInterval(
            this.maintainConnections.bind(this),
            this.maintenanceInterval
        )
    }

    stop(): void {
        if (this.maintenanceTimer) {
            clearInterval(this.maintenanceTimer)
            this.maintenanceTimer = null
        }
    }

    private connectTo({ id, ws }: TrackerInfo): void {
        this.nodeToTracker.connectToTracker(ws, PeerInfo.newTracker(id))
            .then(() => this.unconnectables.delete(id))
            .catch((err) => {
                if (!this.unconnectables.has(id)) {
                    // TODO we could also store the previous error and check that the current error is the same?
                    // -> now it doesn't log anything if the connection error reason changes
                    this.unconnectables.add(id)
                    this.logger.warn('could not connect to tracker %s, reason: %j', ws, err)
                }
            })
    }

    private isActiveTracker(trackerId: TrackerId): boolean {
        for (const streamKey of this.streamManager.getStreamKeys()) {
            const { id: streamId, partition } = StreamIdAndPartition.fromKey(streamKey)
            if (this.trackerRegistry.getTracker(streamId, partition).id === trackerId) {
                return true
            }
        }
        return false
    }
}
