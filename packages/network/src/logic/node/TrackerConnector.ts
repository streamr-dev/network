import { Utils } from 'streamr-client-protocol'
import { StreamIdAndPartition, TrackerInfo } from '../../identifiers'
import { Logger } from '../../helpers/Logger'
import { PeerInfo } from '../../connection/PeerInfo'
import { TrackerId } from '../tracker/Tracker'
import { NameDirectory } from '../../NameDirectory'

const logger = new Logger(module)

enum ConnectionState {
    SUCCESS,
    ERROR
}

type GetStreamsFn = () => Iterable<StreamIdAndPartition>
type ConnectToTrackerFn = (trackerAddress: string, trackerPeerInfo: PeerInfo) => Promise<unknown>
type DisconnectFromTrackerFn = (trackerId: TrackerId) => void

export class TrackerConnector {
    private readonly getStreams: GetStreamsFn
    private readonly connectToTracker: ConnectToTrackerFn
    private readonly disconnectFromTracker: DisconnectFromTrackerFn
    private readonly trackerRegistry: Utils.TrackerRegistry<TrackerInfo>
    private maintenanceTimer?: NodeJS.Timeout | null
    private readonly maintenanceInterval: number
    private connectionStates: Map<TrackerId, ConnectionState>

    constructor(
        getStreams: GetStreamsFn,
        connectToTracker: ConnectToTrackerFn,
        disconnectFromTracker: DisconnectFromTrackerFn,
        trackerRegistry: Utils.TrackerRegistry<TrackerInfo>,
        maintenanceInterval: number
    ) {
        this.getStreams = getStreams
        this.connectToTracker = connectToTracker
        this.disconnectFromTracker = disconnectFromTracker
        this.trackerRegistry = trackerRegistry
        this.maintenanceInterval = maintenanceInterval
        this.connectionStates = new Map()
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

    private maintainConnections(): void {
        this.trackerRegistry.getAllTrackers().forEach((trackerInfo) => {
            if (this.isActiveTracker(trackerInfo.id)) {
                this.connectTo(trackerInfo)
            } else {
                this.disconnectFromTracker(trackerInfo.id)
            }
        })
    }

    private connectTo({ id, ws }: TrackerInfo): void {
        this.connectToTracker(ws, PeerInfo.newTracker(id))
            .then(() => {
                if (this.connectionStates.get(id) !== ConnectionState.SUCCESS) {
                    logger.info('Connected to tracker %s', NameDirectory.getName(id))
                    this.connectionStates.set(id, ConnectionState.SUCCESS)
                }
                return
            })
            .catch((err) => {
                if (this.connectionStates.get(id) !== ConnectionState.ERROR) {
                    // TODO we could also store the previous error and check that the current error is the same?
                    // -> now it doesn't log anything if the connection error reason changes
                    this.connectionStates.set(id, ConnectionState.ERROR)
                    logger.warn('Could not connect to tracker %s, reason: %s', NameDirectory.getName(id), err.message)
                }
            })
    }

    private isActiveTracker(trackerId: TrackerId): boolean {
        for (const { id: streamId, partition } of this.getStreams()) {
            if (this.trackerRegistry.getTracker(streamId, partition).id === trackerId) {
                return true
            }
        }
        return false
    }
}
