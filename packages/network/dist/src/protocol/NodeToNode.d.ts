/// <reference types="node" />
import { EventEmitter } from 'events';
import { BroadcastMessage, ControlMessage, ProxyConnectionRequest, ProxyConnectionResponse, ProxyDirection, StreamMessage, StreamPartID, UnsubscribeRequest } from '@streamr/protocol';
import { IWebRtcEndpoint } from '../connection/webrtc/IWebRtcEndpoint';
import { PeerInfo } from '../connection/PeerInfo';
import { Rtts, NodeId } from "../identifiers";
export declare enum Event {
    NODE_CONNECTED = "streamr:node-node:node-connected",
    NODE_DISCONNECTED = "streamr:node-node:node-disconnected",
    DATA_RECEIVED = "streamr:node-node:stream-data",
    LOW_BACK_PRESSURE = "streamr:node-node:low-back-pressure",
    HIGH_BACK_PRESSURE = "streamr:node-node:high-back-pressure",
    PROXY_CONNECTION_REQUEST_RECEIVED = "node-node:publish-only-stream-request-received",
    PROXY_CONNECTION_RESPONSE_RECEIVED = "node-node:publish-only-stream-response-received",
    LEAVE_REQUEST_RECEIVED = "node-node:leave-request-received"
}
export interface NodeToNode {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this;
    on(event: Event.NODE_DISCONNECTED, listener: (nodeId: NodeId) => void): this;
    on(event: Event.DATA_RECEIVED, listener: (message: BroadcastMessage, nodeId: NodeId) => void): this;
    on(event: Event.LOW_BACK_PRESSURE, listener: (nodeId: NodeId) => void): this;
    on(event: Event.HIGH_BACK_PRESSURE, listener: (nodeId: NodeId) => void): this;
    on(event: Event.PROXY_CONNECTION_REQUEST_RECEIVED, listener: (message: ProxyConnectionRequest, nodeId: NodeId) => void): this;
    on(event: Event.PROXY_CONNECTION_RESPONSE_RECEIVED, listener: (message: ProxyConnectionResponse, nodeId: NodeId) => void): this;
    on(event: Event.LEAVE_REQUEST_RECEIVED, listener: (message: UnsubscribeRequest, nodeId: NodeId) => void): this;
}
export declare class NodeToNode extends EventEmitter {
    private readonly endpoint;
    constructor(endpoint: IWebRtcEndpoint);
    connectToNode(receiverNodeId: NodeId, trackerId: string, trackerInstructed?: boolean): Promise<NodeId>;
    sendData(receiverNodeId: NodeId, streamMessage: StreamMessage): Promise<BroadcastMessage>;
    send<T>(receiverNodeId: NodeId, message: T & ControlMessage): Promise<T>;
    disconnectFromNode(receiverNodeId: NodeId, reason: string): void;
    /**
     * @deprecated
     */
    getAddress(): string;
    stop(): void;
    onPeerConnected(peerInfo: PeerInfo): void;
    onPeerDisconnected(peerInfo: PeerInfo): void;
    onMessageReceived(peerInfo: PeerInfo, rawMessage: string): void;
    onLowBackPressure(peerInfo: PeerInfo): void;
    onHighBackPressure(peerInfo: PeerInfo): void;
    getRtts(): Readonly<Rtts>;
    getNegotiatedProtocolVersionsOnNode(nodeId: NodeId): [number, number];
    requestProxyConnection(nodeId: NodeId, streamPartId: StreamPartID, direction: ProxyDirection, userId: string): Promise<void>;
    leaveStreamOnNode(nodeId: NodeId, streamPartId: StreamPartID): Promise<void>;
    respondToProxyConnectionRequest(nodeId: NodeId, streamPartId: StreamPartID, direction: ProxyDirection, accepted: boolean): Promise<void>;
    getAllConnectionNodeIds(): NodeId[];
    getDiagnosticInfo(): Record<string, unknown>;
}
