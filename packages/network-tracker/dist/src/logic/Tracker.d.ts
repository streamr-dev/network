/// <reference types="node" />
import { EventEmitter } from 'events';
import { TrackerRegistryRecord, StatusMessage, StreamPartID } from '@streamr/protocol';
import { TrackerServer } from '../protocol/TrackerServer';
import { OverlayTopology } from './OverlayTopology';
import { PeerId, PeerInfo, NodeId, Location } from '@streamr/network-node';
import { MetricsContext } from '@streamr/utils';
export type TrackerId = string;
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
export type OverlayPerStreamPart = Record<StreamPartID, OverlayTopology>;
export type OverlayConnectionRtts = Record<NodeId, Record<NodeId, number>>;
export interface Tracker {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this;
}
export declare function convertTestNet3Status(statusMessage: StatusMessage): void;
export declare class Tracker extends EventEmitter {
    private readonly maxNeighborsPerNode;
    private readonly trackerServer;
    private readonly overlayPerStreamPart;
    private readonly overlayConnectionRtts;
    private readonly locationManager;
    private readonly instructionCounter;
    private readonly instructionAndStatusAckSender;
    private readonly extraMetadatas;
    private readonly metrics;
    private readonly statusSchemaValidator;
    private stopped;
    constructor(opts: TrackerOptions);
    onNodeConnected(node: NodeId): void;
    onNodeDisconnected(node: NodeId): void;
    processNodeStatus(statusMessage: StatusMessage, source: NodeId): void;
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
    getConfigRecord(): TrackerRegistryRecord;
    getTrackerId(): PeerId;
}
