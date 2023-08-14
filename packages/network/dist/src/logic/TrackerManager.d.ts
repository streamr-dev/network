import { TrackerRegistryRecord, StreamPartID } from '@streamr/protocol';
import { Location, Rtts, NodeId, TrackerId } from '../identifiers';
import { NodeToTracker } from '../protocol/NodeToTracker';
import { StreamPartManager } from './StreamPartManager';
interface NodeDescriptor {
    started: string;
    location?: Location;
    extra: Record<string, unknown>;
    rtts: Readonly<Rtts> | null;
}
interface Subscriber {
    subscribeToStreamPartOnNodes: (nodeIds: NodeId[], streamPartId: StreamPartID, trackerId: TrackerId, reattempt: boolean) => Promise<PromiseSettledResult<NodeId>[]>;
    unsubscribeFromStreamPartOnNode: (node: NodeId, streamPartId: StreamPartID, sendStatus?: boolean) => void;
    emitJoinCompleted: (streamPartId: StreamPartID, numOfNeighbors: number) => void;
    emitJoinFailed: (streamPartId: StreamPartID, error: string) => void;
}
type GetNodeDescriptor = (includeRtt: boolean) => NodeDescriptor;
export interface TrackerManagerOptions {
    trackers: Array<TrackerRegistryRecord>;
    rttUpdateTimeout: number;
    trackerConnectionMaintenanceInterval: number;
    instructionRetryInterval?: number;
}
export declare class TrackerManager {
    private readonly rttUpdateTimeoutsOnTrackers;
    private readonly trackerRegistry;
    private readonly trackerConnector;
    private readonly nodeToTracker;
    private readonly streamPartManager;
    private readonly rttUpdateInterval;
    private readonly instructionThrottler;
    private readonly instructionRetryManager;
    private readonly getNodeDescriptor;
    private readonly subscriber;
    constructor(nodeToTracker: NodeToTracker, opts: TrackerManagerOptions, streamPartManager: StreamPartManager, getNodeDescriptor: GetNodeDescriptor, subscriber: Subscriber);
    sendStreamPartStatus(streamPartId: StreamPartID): void;
    onNewStreamPart(streamPartId: StreamPartID): void;
    addSignallingOnlySession(streamPartId: StreamPartID, nodeToSignal: NodeId): Promise<void>;
    removeSignallingOnlySession(streamPartId: StreamPartID, nodeToSignal: NodeId): void;
    onUnsubscribeFromStreamPart(streamPartId: StreamPartID): void;
    start(): void;
    stop(): Promise<void>;
    private getStreamPartsForTracker;
    private shouldIncludeRttInfo;
    private sendStatus;
    private handleTrackerInstruction;
    getTrackerId(streamPartId: StreamPartID): TrackerId;
    getTrackerAddress(streamPartId: StreamPartID): TrackerId;
    getDiagnosticInfo(): Record<string, unknown>;
}
export {};
