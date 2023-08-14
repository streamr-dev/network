import { TrackerRegistryRecord, StreamPartID, TrackerRegistry } from '@streamr/protocol';
import { NodeId, TrackerId } from '../identifiers';
import { PeerInfo } from '../connection/PeerInfo';
type getStreamPartsFn = () => Iterable<StreamPartID>;
type ConnectToTrackerFn = (trackerAddress: string, trackerPeerInfo: PeerInfo) => Promise<unknown>;
type DisconnectFromTrackerFn = (trackerId: TrackerId) => void;
export declare class TrackerConnector {
    private readonly getStreamParts;
    private readonly connectToTracker;
    private readonly disconnectFromTracker;
    private readonly trackerRegistry;
    private maintenanceTimer?;
    private readonly maintenanceInterval;
    private connectionStates;
    private readonly signallingOnlySessions;
    constructor(getStreamParts: getStreamPartsFn, connectToTracker: ConnectToTrackerFn, disconnectFromTracker: DisconnectFromTrackerFn, trackerRegistry: TrackerRegistry<TrackerRegistryRecord>, maintenanceInterval: number);
    onNewStreamPart(streamPartId: StreamPartID): void;
    addSignallingOnlySession(streamPartId: StreamPartID, nodeToSignal: NodeId): Promise<void>;
    removeSignallingOnlySession(streamPartId: StreamPartID, nodeToSignal: NodeId): void;
    start(): void;
    stop(): void;
    private maintainConnections;
    private connectTo;
    private isActiveTracker;
}
export {};
