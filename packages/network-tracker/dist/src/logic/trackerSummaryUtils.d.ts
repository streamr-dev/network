import { StreamPartID, StreamID } from 'streamr-client-protocol';
import { OverlayPerStreamPart, OverlayConnectionRtts } from './Tracker';
import { Location, NodeId } from 'streamr-network';
declare type OverLayWithRtts = Record<StreamPartID, Record<NodeId, {
    neighborId: NodeId;
    rtt: number | null;
}[]>>;
declare type OverlaySizes = {
    streamId: string;
    partition: number;
    nodeCount: number;
}[];
declare type NodesWithLocations = {
    [key: string]: Location;
};
export declare function getTopology(overlayPerStreamPart: OverlayPerStreamPart, connectionRtts: OverlayConnectionRtts, streamId?: StreamID | null, partition?: number | null): OverLayWithRtts;
export declare function getStreamPartSizes(overlayPerStreamPart: OverlayPerStreamPart, streamId?: StreamID | null, partition?: number | null): OverlaySizes;
export declare function getNodeConnections(nodes: readonly NodeId[], overlayPerStreamPart: OverlayPerStreamPart): Record<NodeId, Set<NodeId>>;
export declare function addRttsToNodeConnections(nodeId: NodeId, neighbors: Array<NodeId>, connectionRtts: OverlayConnectionRtts): Record<NodeId, {
    neighborId: NodeId;
    rtt: number | null;
}[]>;
export declare function getNodesWithLocationData(nodes: ReadonlyArray<string>, locations: Readonly<{
    [key: string]: Location;
}>): NodesWithLocations;
export declare function findStreamsPartsForNode(overlayPerStreamPart: OverlayPerStreamPart, nodeId: NodeId): Array<{
    streamId: string;
    partition: number;
    topologySize: number;
}>;
export {};
