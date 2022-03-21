/// <reference types="node" />
import { EventEmitter } from 'events';
import { SmartContractRecord, StatusMessage, StreamPartID, TrackerLayer } from 'streamr-client-protocol';
import { TrackerServer } from '../protocol/TrackerServer';
import { OverlayTopology } from './OverlayTopology';
import { PeerId, PeerInfo, NodeId, Location, MetricsContext } from 'streamr-network';
export declare type TrackerId = string;
export declare enum Event {
    NODE_CONNECTED = "streamr:tracker:node-connected"
}
export interface TopologyStabilizationOptions {
    debounceWait: number;
    maxWait: number;
}
export interface TrackerOptions {
    maxNeighborsPerNode: number;
    peerInfo: PeerInfo;
    protocols: {
        trackerServer: TrackerServer;
    };
    metricsContext?: MetricsContext;
    topologyStabilization?: TopologyStabilizationOptions;
}
export declare type OverlayPerStreamPart = Record<StreamPartID, OverlayTopology>;
export declare type OverlayConnectionRtts = Record<NodeId, Record<NodeId, number>>;
export interface Tracker {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this;
}
export declare function convertTestNet3Status(statusMessage: StatusMessage): void;
export declare class Tracker extends EventEmitter {
    private readonly maxNeighborsPerNode;
    private readonly trackerServer;
    /** @internal */
    readonly peerInfo: PeerInfo;
    private readonly overlayPerStreamPart;
    private readonly overlayConnectionRtts;
    private readonly locationManager;
    private readonly instructionCounter;
    private readonly instructionSender;
    private readonly extraMetadatas;
    private readonly logger;
    private readonly metrics;
    private readonly statusSchemaValidator;
    private stopped;
    constructor(opts: TrackerOptions);
    onNodeConnected(node: NodeId): void;
    onNodeDisconnected(node: NodeId): void;
    processNodeStatus(statusMessage: TrackerLayer.StatusMessage, source: NodeId): void;
    stop(): Promise<void>;
    getUrl(): string;
    private createTopology;
    private updateNodeOnStream;
    private formAndSendInstructions;
    private removeNode;
    private leaveAndCheckEmptyOverlay;
    getStreamParts(): Iterable<StreamPartID>;
    getAllNodeLocations(): Readonly<Record<NodeId, Location>>;
    getAllExtraMetadatas(): Readonly<Record<NodeId, Record<string, unknown>>>;
    getNodes(): ReadonlyArray<NodeId>;
    getNodeLocation(node: NodeId): Location;
    getOverlayConnectionRtts(): OverlayConnectionRtts;
    getOverlayPerStreamPart(): Readonly<OverlayPerStreamPart>;
    getConfigRecord(): SmartContractRecord;
    getTrackerId(): PeerId;
}
