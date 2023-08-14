/// <reference types="node" />
import { EventEmitter } from 'events';
import { RelayMessage, StatusMessage, StreamPartID, TrackerMessage } from '@streamr/protocol';
import { DisconnectionCode, DisconnectionReason, NodeId, PeerId, PeerInfo } from '@streamr/network-node';
import type { ServerWsEndpoint } from '@streamr/network-node';
export declare enum Event {
    NODE_CONNECTED = "streamr:tracker:send-peers",
    NODE_DISCONNECTED = "streamr:tracker:node-disconnected",
    NODE_STATUS_RECEIVED = "streamr:tracker:peer-status",
    RELAY_MESSAGE_RECEIVED = "streamr:tracker:relay-message-received"
}
export interface NodeToTracker {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this;
    on(event: Event.NODE_DISCONNECTED, listener: (nodeId: NodeId) => void): this;
    on(event: Event.NODE_STATUS_RECEIVED, listener: (msg: StatusMessage, nodeId: NodeId) => void): this;
    on(event: Event.RELAY_MESSAGE_RECEIVED, listener: (msg: RelayMessage, nodeId: NodeId) => void): this;
}
export declare class TrackerServer extends EventEmitter {
    private readonly endpoint;
    constructor(endpoint: ServerWsEndpoint);
    sendInstruction(receiverNodeId: NodeId, streamPartId: StreamPartID, nodeIds: NodeId[], counter: number): Promise<void>;
    sendStatusAck(receiverNodeId: NodeId, streamPartId: StreamPartID): Promise<void>;
    sendUnknownPeerError(receiverNodeId: NodeId, requestId: string, targetNode: NodeId): Promise<void>;
    send<T>(receiverNodeId: NodeId, message: T & TrackerMessage): Promise<void>;
    getNodeIds(): NodeId[];
    getUrl(): string;
    resolveAddress(peerId: PeerId): string | undefined;
    stop(): Promise<void>;
    onPeerConnected(peerInfo: PeerInfo): void;
    onPeerDisconnected(peerInfo: PeerInfo): void;
    disconnectFromPeer(peerId: string, code?: DisconnectionCode, reason?: DisconnectionReason): void;
    onMessageReceived(peerInfo: PeerInfo, rawMessage: string): void;
}
