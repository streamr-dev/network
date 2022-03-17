/// <reference types="node" />
import { EventEmitter } from 'events';
import { StreamPartID, TrackerLayer } from 'streamr-client-protocol';
import { PeerId, PeerInfo, ServerWsEndpoint, DisconnectionCode, DisconnectionReason, NodeId } from 'streamr-network';
export declare enum Event {
    NODE_CONNECTED = "streamr:tracker:send-peers",
    NODE_DISCONNECTED = "streamr:tracker:node-disconnected",
    NODE_STATUS_RECEIVED = "streamr:tracker:peer-status",
    RELAY_MESSAGE_RECEIVED = "streamr:tracker:relay-message-received"
}
export interface NodeToTracker {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this;
    on(event: Event.NODE_DISCONNECTED, listener: (nodeId: NodeId) => void): this;
    on(event: Event.NODE_STATUS_RECEIVED, listener: (msg: TrackerLayer.StatusMessage, nodeId: NodeId) => void): this;
    on(event: Event.RELAY_MESSAGE_RECEIVED, listener: (msg: TrackerLayer.RelayMessage, nodeId: NodeId) => void): this;
}
export declare class TrackerServer extends EventEmitter {
    private readonly endpoint;
    private readonly logger;
    constructor(endpoint: ServerWsEndpoint);
    sendInstruction(receiverNodeId: NodeId, streamPartId: StreamPartID, nodeIds: NodeId[], counter: number): Promise<void>;
    sendRtcOffer(receiverNodeId: NodeId, requestId: string, originatorInfo: TrackerLayer.Originator, connectionId: string, description: string): Promise<void>;
    sendRtcAnswer(receiverNodeId: NodeId, requestId: string, originatorInfo: TrackerLayer.Originator, connectionId: string, description: string): Promise<void>;
    sendRtcConnect(receiverNodeId: NodeId, requestId: string, originatorInfo: TrackerLayer.Originator): Promise<void>;
    sendRtcIceCandidate(receiverNodeId: NodeId, requestId: string, originatorInfo: TrackerLayer.Originator, connectionId: string, candidate: string, mid: string): Promise<void>;
    sendUnknownPeerRtcError(receiverNodeId: NodeId, requestId: string, targetNode: NodeId): Promise<void>;
    send<T>(receiverNodeId: NodeId, message: T & TrackerLayer.TrackerMessage): Promise<void>;
    getNodeIds(): NodeId[];
    getUrl(): string;
    resolveAddress(peerId: PeerId): string | undefined;
    stop(): Promise<void>;
    onPeerConnected(peerInfo: PeerInfo): void;
    onPeerDisconnected(peerInfo: PeerInfo): void;
    disconnectFromPeer(peerId: string, code?: DisconnectionCode, reason?: DisconnectionReason): void;
    onMessageReceived(peerInfo: PeerInfo, rawMessage: string): void;
}
