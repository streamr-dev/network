import { Utils } from 'streamr-client-protocol'
import { StreamIdAndPartition, TrackerInfo } from '../identifiers'
import { NodeToTracker } from '../protocol/NodeToTracker'
import { Logger } from '../helpers/Logger'
import { PeerInfo } from '../connection/PeerInfo'
import { TrackerId } from './Tracker'
import { StreamManager } from './StreamManager'

const logger = new Logger(module)

enum ConnectionState {
    SUCCESS,
    ERROR
}

export class TrackerConnector {

    private readonly streamManager: StreamManager
    private readonly nodeToTracker: NodeToTracker
    private readonly trackerRegistry: Utils.TrackerRegistry<TrackerInfo>
    private maintenanceTimer?: NodeJS.Timeout | null
    private readonly maintenanceInterval: number
    private connectionStates: Map<TrackerId,ConnectionState>

    constructor(
        streamManager: StreamManager,
        nodeToTracker: NodeToTracker,
        trackerRegistry: Utils.TrackerRegistry<TrackerInfo>,
        maintenanceInterval: number
    ) {
        this.streamManager = streamManager
        this.nodeToTracker = nodeToTracker
        this.trackerRegistry = trackerRegistry
        this.maintenanceInterval = maintenanceInterval
        this.connectionStates = new Map()
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

    onNewStream(streamId: StreamIdAndPartition): void {
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
            .then(() => {
                if (this.connectionStates.get(id) !== ConnectionState.SUCCESS) {
                    logger.info('Connected to tracker %s', id)
                    this.connectionStates.set(id, ConnectionState.SUCCESS)
                }
                return
            })
            .catch((err) => {
                if (this.connectionStates.get(id) !== ConnectionState.ERROR) {
                    // TODO we could also store the previous error and check that the current error is the same?
                    // -> now it doesn't log anything if the connection error reason changes
                    this.connectionStates.set(id, ConnectionState.ERROR)
                    logger.warn('Could not connect to tracker %s, reason: %s', id, err.message)
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
