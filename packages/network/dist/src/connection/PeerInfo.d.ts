import { Location, NodeId, TrackerId } from '../identifiers';
export type PeerId = NodeId | TrackerId | string;
export declare enum PeerType {
    Tracker = "tracker",
    Node = "node",
    Unknown = "unknown"
}
interface ObjectRepresentation {
    peerId: PeerId;
    peerType: string;
    controlLayerVersions: number[] | null;
    messageLayerVersions: number[] | null;
    location?: Location | null | undefined;
}
export declare class PeerInfo {
    static newTracker(peerId: TrackerId, controlLayerVersions?: number[], messageLayerVersions?: number[], location?: Location): PeerInfo;
    static newNode(peerId: NodeId, controlLayerVersions?: number[] | undefined, messageLayerVersions?: number[] | undefined, location?: Location): PeerInfo;
    static newUnknown(peerId: PeerId): PeerInfo;
    static fromObject({ peerId, peerType, location, controlLayerVersions, messageLayerVersions }: ObjectRepresentation): PeerInfo;
    readonly peerId: PeerId;
    readonly peerType: PeerType;
    readonly controlLayerVersions: number[];
    readonly messageLayerVersions: number[];
    readonly location: Location | undefined;
    constructor(peerId: PeerId, peerType: PeerType, controlLayerVersions?: number[], messageLayerVersions?: number[], location?: Location);
    isTracker(): boolean;
    isNode(): boolean;
    toString(): string;
}
export {};
