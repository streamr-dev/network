import { TrackerRegistryRecord, StreamPartID, TrackerRegistry } from '@streamr/protocol'
import { NodeId, TrackerId } from '../identifiers'
import { Logger } from "@streamr/utils"
import { PeerInfo } from '../connection/PeerInfo'
import { NameDirectory } from '../NameDirectory'

const logger = new Logger(module)

enum ConnectionState {
    SUCCESS,
    ERROR
}

type getStreamPartsFn = () => Iterable<StreamPartID>
type ConnectToTrackerFn = (trackerAddress: string, trackerPeerInfo: PeerInfo) => Promise<unknown>
type DisconnectFromTrackerFn = (trackerId: TrackerId) => void

export class TrackerConnector {
    private readonly getStreamParts: getStreamPartsFn
    private readonly connectToTracker: ConnectToTrackerFn
    private readonly disconnectFromTracker: DisconnectFromTrackerFn
    private readonly trackerRegistry: TrackerRegistry<TrackerRegistryRecord>
    private maintenanceTimer?: NodeJS.Timeout | null
    private readonly maintenanceInterval: number
    private connectionStates: Map<TrackerId, ConnectionState>
    private readonly signallingOnlySessions: Map<StreamPartID, Set<NodeId>>

    constructor(
        getStreamParts: getStreamPartsFn,
        connectToTracker: ConnectToTrackerFn,
        disconnectFromTracker: DisconnectFromTrackerFn,
        trackerRegistry: TrackerRegistry<TrackerRegistryRecord>,
        maintenanceInterval: number
    ) {
        this.getStreamParts = getStreamParts
        this.connectToTracker = connectToTracker
        this.disconnectFromTracker = disconnectFromTracker
        this.trackerRegistry = trackerRegistry
        this.maintenanceInterval = maintenanceInterval
        this.connectionStates = new Map()
        this.signallingOnlySessions = new Map()
    }

    onNewStreamPart(streamPartId: StreamPartID): void {
        const trackerInfo = this.trackerRegistry.getTracker(streamPartId)
        this.connectTo(trackerInfo)
    }

    async addSignallingOnlySession(streamPartId: StreamPartID, nodeToSignal: NodeId): Promise<void> {
        const tracker = this.trackerRegistry.getTracker(streamPartId)
        if (!this.signallingOnlySessions.has(streamPartId)) {
            this.signallingOnlySessions.set(streamPartId, new Set())
        }
        this.signallingOnlySessions.get(streamPartId)!.add(nodeToSignal)
        await this.connectToTracker(tracker.ws, PeerInfo.newTracker(tracker.id))
        logger.info('Connected to tracker for signalling only', { trackerId: NameDirectory.getName(tracker.id) })
    }

    removeSignallingOnlySession(streamPartId: StreamPartID, nodeToSignal: NodeId): void {
        if (this.signallingOnlySessions.has(streamPartId)) {
            const session = this.signallingOnlySessions.get(streamPartId)!
            session.delete(nodeToSignal)
            if (session.size === 0) {
                this.signallingOnlySessions.delete(streamPartId)
            }
        }
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

    private connectTo({ id, ws }: TrackerRegistryRecord): void {
        this.connectToTracker(ws, PeerInfo.newTracker(id))
            .then(() => {
                if (this.connectionStates.get(id) !== ConnectionState.SUCCESS) {
                    logger.info('Connected to tracker', {
                        trackerId: NameDirectory.getName(id)
                    })
                    this.connectionStates.set(id, ConnectionState.SUCCESS)
                }
                return
            })
            .catch((err) => {
                if (this.connectionStates.get(id) !== ConnectionState.ERROR) {
                    // TODO we could also store the previous error and check that the current error is the same?
                    // -> now it doesn't log anything if the connection error reason changes
                    this.connectionStates.set(id, ConnectionState.ERROR)
                    logger.warn('Could not connect to tracker', {
                        trackerId: NameDirectory.getName(id),
                        reason: err.message
                    })
                }
            })
    }

    private isActiveTracker(trackerId: TrackerId): boolean {
        const streamPartIds = [...this.getStreamParts(), ...this.signallingOnlySessions.keys()]
        for (const streamPartId of streamPartIds) {
            if (this.trackerRegistry.getTracker(streamPartId).id === trackerId) {
                return true
            }
        }
        return false
    }
}
