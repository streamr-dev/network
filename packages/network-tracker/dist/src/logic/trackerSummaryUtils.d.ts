import { StreamPartID, StreamID } from '@streamr/protocol';
import { OverlayPerStreamPart, OverlayConnectionRtts } from './Tracker';
import { Location, NodeId } from '@streamr/network-node';
type OverLayWithRtts = Record<StreamPartID, Record<NodeId, {
    neighborId: NodeId;
    rtt: number | null;
}[]>>;
type OverlaySizes = {
    streamId: string;
    partition: number;
    nodeCount: number;
}[];
type NodesWithLocations = Record<string, Location>;
export declare function getTopology(overlayPerStreamPart: OverlayPerStreamPart, connectionRtts: OverlayConnectionRtts, streamId?: StreamID | null, partition?: number | null): OverLayWithRtts;
export declare function getStreamPartSizes(overlayPerStreamPart: OverlayPerStreamPart, streamId?: StreamID | null, partition?: number | null): OverlaySizes;
export declare function getNodeConnections(nodes: readonly NodeId[], overlayPerStreamPart: OverlayPerStreamPart): Record<NodeId, Set<NodeId>>;
export declare function addRttsToNodeConnections(nodeId: NodeId, neighbors: Array<NodeId>, connectionRtts: OverlayConnectionRtts): Record<NodeId, {
    neighborId: NodeId;
    rtt: number | null;
}[]>;
export declare function getNodesWithLocationData(nodes: ReadonlyArray<string>, locations: Readonly<Record<string, Location>>): NodesWithLocations;
export declare function findStreamsPartsForNode(overlayPerStreamPart: OverlayPerStreamPart, nodeId: NodeId): Array<{
    streamId: string;
    partition: number;
    topologySize: number;
}>;
export {};
