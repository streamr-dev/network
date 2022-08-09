// @generated by protobuf-ts 2.7.0 with parameter server_generic,generate_dependencies
// @generated from protobuf file "packages/dht/protos/DhtRpc.proto" (syntax proto3)
// tslint:disable
import { Empty } from "../../../google/protobuf/empty";
import { ServiceType } from "@protobuf-ts/runtime-rpc";
import { MessageType as MessageType$ } from "@protobuf-ts/runtime";
// Used inside RpcMessage

/**
 * @generated from protobuf message ClosestPeersRequest
 */
export interface ClosestPeersRequest {
    /**
     * @generated from protobuf field: PeerDescriptor peerDescriptor = 1;
     */
    peerDescriptor?: PeerDescriptor;
    /**
     * @generated from protobuf field: string nonce = 2;
     */
    nonce: string; // requestId
}
/**
 * @generated from protobuf message ClosestPeersResponse
 */
export interface ClosestPeersResponse {
    /**
     * @generated from protobuf field: repeated PeerDescriptor peers = 1;
     */
    peers: PeerDescriptor[];
    /**
     * @generated from protobuf field: string nonce = 2;
     */
    nonce: string; // requestId
}
/**
 * @generated from protobuf message PingRequest
 */
export interface PingRequest {
    /**
     * @generated from protobuf field: string nonce = 1;
     */
    nonce: string;
}
/**
 * @generated from protobuf message PingResponse
 */
export interface PingResponse {
    /**
     * @generated from protobuf field: string nonce = 1;
     */
    nonce: string;
}
/**
 * @generated from protobuf message PeerDescriptor
 */
export interface PeerDescriptor {
    /**
     * @generated from protobuf field: bytes peerId = 1;
     */
    peerId: Uint8Array;
    /**
     * @generated from protobuf field: NodeType type = 2;
     */
    type: NodeType;
    /**
     * @generated from protobuf field: ConnectivityMethod udp = 3;
     */
    udp?: ConnectivityMethod;
    /**
     * @generated from protobuf field: ConnectivityMethod tcp = 4;
     */
    tcp?: ConnectivityMethod;
    /**
     * @generated from protobuf field: ConnectivityMethod websocket = 5;
     */
    websocket?: ConnectivityMethod;
    /**
     * @generated from protobuf field: optional bool openInternet = 6;
     */
    openInternet?: boolean;
}
/**
 * @generated from protobuf message ConnectivityMethod
 */
export interface ConnectivityMethod {
    /**
     * @generated from protobuf field: uint32 port = 2;
     */
    port: number;
    /**
     * @generated from protobuf field: string ip = 3;
     */
    ip: string;
}
/**
 * @generated from protobuf message ConnectivityReportRequest
 */
export interface ConnectivityReportRequest {
    /**
     * @generated from protobuf field: uint32 port = 1;
     */
    port: number;
    /**
     * @generated from protobuf field: string nonce = 2;
     */
    nonce: string; // requestId
}
/**
 * @generated from protobuf message ConnectivityReportResponse
 */
export interface ConnectivityReportResponse {
    /**
     * @generated from protobuf field: string open_internet = 1;
     */
    openInternet: string;
    /**
     * @generated from protobuf field: string ip = 2;
     */
    ip: string;
    /**
     * @generated from protobuf field: string natType = 3;
     */
    natType: string;
    /**
     * @generated from protobuf field: string nonce = 4;
     */
    nonce: string; // requestId
}
/**
 * @generated from protobuf message RouteMessageWrapper
 */
export interface RouteMessageWrapper {
    /**
     * @generated from protobuf field: PeerDescriptor sourcePeer = 1;
     */
    sourcePeer?: PeerDescriptor;
    /**
     * @generated from protobuf field: string nonce = 2;
     */
    nonce: string;
    /**
     * @generated from protobuf field: PeerDescriptor destinationPeer = 3;
     */
    destinationPeer?: PeerDescriptor;
    /**
     * @generated from protobuf field: PeerDescriptor previousPeer = 4;
     */
    previousPeer?: PeerDescriptor;
    /**
     * @generated from protobuf field: bytes message = 5;
     */
    message: Uint8Array; // Expected to be of type Message
}
/**
 * @generated from protobuf message RouteMessageAck
 */
export interface RouteMessageAck {
    /**
     * @generated from protobuf field: PeerDescriptor sourcePeer = 1;
     */
    sourcePeer?: PeerDescriptor;
    /**
     * @generated from protobuf field: string nonce = 2;
     */
    nonce: string;
    /**
     * @generated from protobuf field: PeerDescriptor destinationPeer = 3;
     */
    destinationPeer?: PeerDescriptor;
    /**
     * @generated from protobuf field: string error = 4;
     */
    error: string;
}
// Correspond to the MessageType Enum

/**
 * @generated from protobuf message ConnectivityRequestMessage
 */
export interface ConnectivityRequestMessage {
    /**
     * @generated from protobuf field: uint32 port = 1;
     */
    port: number;
}
/**
 * @generated from protobuf message ConnectivityResponseMessage
 */
export interface ConnectivityResponseMessage {
    /**
     * @generated from protobuf field: bool open_internet = 1;
     */
    openInternet: boolean;
    /**
     * @generated from protobuf field: string ip = 2;
     */
    ip: string;
    /**
     * @generated from protobuf field: string natType = 3;
     */
    natType: string;
    /**
     * @generated from protobuf field: ConnectivityMethod websocket = 4;
     */
    websocket?: ConnectivityMethod;
}
/**
 * @generated from protobuf message HandshakeMessage
 */
export interface HandshakeMessage {
    /**
     * @generated from protobuf field: bytes sourceId = 1;
     */
    sourceId: Uint8Array;
    /**
     * @generated from protobuf field: string protocolVersion = 2;
     */
    protocolVersion: string;
    /**
     * @generated from protobuf field: PeerDescriptor peerDescriptor = 3;
     */
    peerDescriptor?: PeerDescriptor;
}
/**
 * @generated from protobuf message RpcMessage
 */
export interface RpcMessage {
    /**
     * @generated from protobuf field: map<string, string> header = 1;
     */
    header: {
        [key: string]: string;
    };
    /**
     * @generated from protobuf field: bytes body = 2;
     */
    body: Uint8Array;
    /**
     * @generated from protobuf field: string requestId = 3;
     */
    requestId: string;
    /**
     * @generated from protobuf field: optional RpcResponseError responseError = 4;
     */
    responseError?: RpcResponseError;
}
/**
 * @generated from protobuf message Message
 */
export interface Message {
    /**
     * @generated from protobuf field: string messageId = 1;
     */
    messageId: string;
    /**
     * @generated from protobuf field: MessageType messageType = 2;
     */
    messageType: MessageType;
    /**
     * @generated from protobuf field: PeerDescriptor sourceDescriptor = 3;
     */
    sourceDescriptor?: PeerDescriptor;
    /**
     * @generated from protobuf field: PeerDescriptor targetDescriptor = 4;
     */
    targetDescriptor?: PeerDescriptor;
    /**
     * @generated from protobuf field: string serviceId = 5;
     */
    serviceId: string; // id of the RPC service
    /**
     * @generated from protobuf field: bytes body = 6;
     */
    body: Uint8Array;
}
// Connector Messages

/**
 * WebSocket
 *
 * @generated from protobuf message WebSocketConnectionRequest
 */
export interface WebSocketConnectionRequest {
    /**
     * @generated from protobuf field: PeerDescriptor requester = 1;
     */
    requester?: PeerDescriptor;
    /**
     * @generated from protobuf field: PeerDescriptor target = 2;
     */
    target?: PeerDescriptor;
    /**
     * @generated from protobuf field: string ip = 3;
     */
    ip: string;
    /**
     * @generated from protobuf field: uint32 port = 4;
     */
    port: number;
}
/**
 * @generated from protobuf message WebSocketConnectionResponse
 */
export interface WebSocketConnectionResponse {
    /**
     * @generated from protobuf field: PeerDescriptor requester = 1;
     */
    requester?: PeerDescriptor;
    /**
     * @generated from protobuf field: PeerDescriptor target = 2;
     */
    target?: PeerDescriptor;
    /**
     * @generated from protobuf field: bool accepted = 3;
     */
    accepted: boolean;
    /**
     * @generated from protobuf field: optional string reason = 4;
     */
    reason?: string;
}
/**
 * WebRTC
 *
 * @generated from protobuf message WebRtcConnectionRequest
 */
export interface WebRtcConnectionRequest {
    /**
     * @generated from protobuf field: PeerDescriptor requester = 1;
     */
    requester?: PeerDescriptor;
    /**
     * @generated from protobuf field: PeerDescriptor target = 2;
     */
    target?: PeerDescriptor;
    /**
     * @generated from protobuf field: string connectionId = 3;
     */
    connectionId: string;
}
/**
 * @generated from protobuf message RtcOffer
 */
export interface RtcOffer {
    /**
     * @generated from protobuf field: PeerDescriptor requester = 1;
     */
    requester?: PeerDescriptor;
    /**
     * @generated from protobuf field: PeerDescriptor target = 2;
     */
    target?: PeerDescriptor;
    /**
     * @generated from protobuf field: string description = 3;
     */
    description: string;
    /**
     * @generated from protobuf field: string connectionId = 4;
     */
    connectionId: string;
}
/**
 * @generated from protobuf message RtcAnswer
 */
export interface RtcAnswer {
    /**
     * @generated from protobuf field: PeerDescriptor requester = 1;
     */
    requester?: PeerDescriptor;
    /**
     * @generated from protobuf field: PeerDescriptor target = 2;
     */
    target?: PeerDescriptor;
    /**
     * @generated from protobuf field: string description = 3;
     */
    description: string;
    /**
     * @generated from protobuf field: string connectionId = 4;
     */
    connectionId: string;
}
/**
 * @generated from protobuf message IceCandidate
 */
export interface IceCandidate {
    /**
     * @generated from protobuf field: string candidate = 1;
     */
    candidate: string;
    /**
     * @generated from protobuf field: string mid = 2;
     */
    mid: string;
    /**
     * @generated from protobuf field: string connectionId = 3;
     */
    connectionId: string;
    /**
     * @generated from protobuf field: PeerDescriptor requester = 4;
     */
    requester?: PeerDescriptor;
    /**
     * @generated from protobuf field: PeerDescriptor target = 5;
     */
    target?: PeerDescriptor;
}
/**
 * @generated from protobuf enum NodeType
 */
export enum NodeType {
    /**
     * @generated from protobuf enum value: NODEJS = 0;
     */
    NODEJS = 0,
    /**
     * @generated from protobuf enum value: BROWSER = 1;
     */
    BROWSER = 1
}
/**
 * @generated from protobuf enum RpcResponseError
 */
export enum RpcResponseError {
    /**
     * @generated from protobuf enum value: SERVER_TIMOUT = 0;
     */
    SERVER_TIMOUT = 0,
    /**
     * @generated from protobuf enum value: CLIENT_TIMEOUT = 1;
     */
    CLIENT_TIMEOUT = 1,
    /**
     * @generated from protobuf enum value: SERVER_ERROR = 2;
     */
    SERVER_ERROR = 2,
    /**
     * @generated from protobuf enum value: UNKNOWN_RPC_METHOD = 3;
     */
    UNKNOWN_RPC_METHOD = 3
}
// Wraps all messages

/**
 * @generated from protobuf enum MessageType
 */
export enum MessageType {
    /**
     * @generated from protobuf enum value: CONNECTIVITY_REQUEST = 0;
     */
    CONNECTIVITY_REQUEST = 0,
    /**
     * @generated from protobuf enum value: CONNECTIVITY_RESPONSE = 1;
     */
    CONNECTIVITY_RESPONSE = 1,
    /**
     * @generated from protobuf enum value: HANDSHAKE = 2;
     */
    HANDSHAKE = 2,
    /**
     * @generated from protobuf enum value: RPC = 3;
     */
    RPC = 3,
    /**
     * @generated from protobuf enum value: WEBSOCKET_CONNECTOR = 4;
     */
    WEBSOCKET_CONNECTOR = 4,
    /**
     * @generated from protobuf enum value: WEBRTC_CONNECTOR = 5;
     */
    WEBRTC_CONNECTOR = 5
}
// @generated message type with reflection information, may provide speed optimized methods
class ClosestPeersRequest$Type extends MessageType$<ClosestPeersRequest> {
    constructor() {
        super("ClosestPeersRequest", [
            { no: 1, name: "peerDescriptor", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "nonce", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ClosestPeersRequest
 */
export const ClosestPeersRequest = new ClosestPeersRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ClosestPeersResponse$Type extends MessageType$<ClosestPeersResponse> {
    constructor() {
        super("ClosestPeersResponse", [
            { no: 1, name: "peers", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor },
            { no: 2, name: "nonce", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ClosestPeersResponse
 */
export const ClosestPeersResponse = new ClosestPeersResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class PingRequest$Type extends MessageType$<PingRequest> {
    constructor() {
        super("PingRequest", [
            { no: 1, name: "nonce", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message PingRequest
 */
export const PingRequest = new PingRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class PingResponse$Type extends MessageType$<PingResponse> {
    constructor() {
        super("PingResponse", [
            { no: 1, name: "nonce", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message PingResponse
 */
export const PingResponse = new PingResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class PeerDescriptor$Type extends MessageType$<PeerDescriptor> {
    constructor() {
        super("PeerDescriptor", [
            { no: 1, name: "peerId", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 2, name: "type", kind: "enum", T: () => ["NodeType", NodeType] },
            { no: 3, name: "udp", kind: "message", T: () => ConnectivityMethod },
            { no: 4, name: "tcp", kind: "message", T: () => ConnectivityMethod },
            { no: 5, name: "websocket", kind: "message", T: () => ConnectivityMethod },
            { no: 6, name: "openInternet", kind: "scalar", opt: true, T: 8 /*ScalarType.BOOL*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message PeerDescriptor
 */
export const PeerDescriptor = new PeerDescriptor$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ConnectivityMethod$Type extends MessageType$<ConnectivityMethod> {
    constructor() {
        super("ConnectivityMethod", [
            { no: 2, name: "port", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
            { no: 3, name: "ip", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ConnectivityMethod
 */
export const ConnectivityMethod = new ConnectivityMethod$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ConnectivityReportRequest$Type extends MessageType$<ConnectivityReportRequest> {
    constructor() {
        super("ConnectivityReportRequest", [
            { no: 1, name: "port", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
            { no: 2, name: "nonce", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ConnectivityReportRequest
 */
export const ConnectivityReportRequest = new ConnectivityReportRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ConnectivityReportResponse$Type extends MessageType$<ConnectivityReportResponse> {
    constructor() {
        super("ConnectivityReportResponse", [
            { no: 1, name: "open_internet", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "ip", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "natType", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "nonce", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ConnectivityReportResponse
 */
export const ConnectivityReportResponse = new ConnectivityReportResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RouteMessageWrapper$Type extends MessageType$<RouteMessageWrapper> {
    constructor() {
        super("RouteMessageWrapper", [
            { no: 1, name: "sourcePeer", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "nonce", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "destinationPeer", kind: "message", T: () => PeerDescriptor },
            { no: 4, name: "previousPeer", kind: "message", T: () => PeerDescriptor },
            { no: 5, name: "message", kind: "scalar", T: 12 /*ScalarType.BYTES*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message RouteMessageWrapper
 */
export const RouteMessageWrapper = new RouteMessageWrapper$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RouteMessageAck$Type extends MessageType$<RouteMessageAck> {
    constructor() {
        super("RouteMessageAck", [
            { no: 1, name: "sourcePeer", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "nonce", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "destinationPeer", kind: "message", T: () => PeerDescriptor },
            { no: 4, name: "error", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message RouteMessageAck
 */
export const RouteMessageAck = new RouteMessageAck$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ConnectivityRequestMessage$Type extends MessageType$<ConnectivityRequestMessage> {
    constructor() {
        super("ConnectivityRequestMessage", [
            { no: 1, name: "port", kind: "scalar", T: 13 /*ScalarType.UINT32*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ConnectivityRequestMessage
 */
export const ConnectivityRequestMessage = new ConnectivityRequestMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ConnectivityResponseMessage$Type extends MessageType$<ConnectivityResponseMessage> {
    constructor() {
        super("ConnectivityResponseMessage", [
            { no: 1, name: "open_internet", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
            { no: 2, name: "ip", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "natType", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "websocket", kind: "message", T: () => ConnectivityMethod }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ConnectivityResponseMessage
 */
export const ConnectivityResponseMessage = new ConnectivityResponseMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class HandshakeMessage$Type extends MessageType$<HandshakeMessage> {
    constructor() {
        super("HandshakeMessage", [
            { no: 1, name: "sourceId", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 2, name: "protocolVersion", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "peerDescriptor", kind: "message", T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message HandshakeMessage
 */
export const HandshakeMessage = new HandshakeMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RpcMessage$Type extends MessageType$<RpcMessage> {
    constructor() {
        super("RpcMessage", [
            { no: 1, name: "header", kind: "map", K: 9 /*ScalarType.STRING*/, V: { kind: "scalar", T: 9 /*ScalarType.STRING*/ } },
            { no: 2, name: "body", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 3, name: "requestId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "responseError", kind: "enum", opt: true, T: () => ["RpcResponseError", RpcResponseError] }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message RpcMessage
 */
export const RpcMessage = new RpcMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class Message$Type extends MessageType$<Message> {
    constructor() {
        super("Message", [
            { no: 1, name: "messageId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "messageType", kind: "enum", T: () => ["MessageType", MessageType] },
            { no: 3, name: "sourceDescriptor", kind: "message", T: () => PeerDescriptor },
            { no: 4, name: "targetDescriptor", kind: "message", T: () => PeerDescriptor },
            { no: 5, name: "serviceId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 6, name: "body", kind: "scalar", T: 12 /*ScalarType.BYTES*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message Message
 */
export const Message = new Message$Type();
// @generated message type with reflection information, may provide speed optimized methods
class WebSocketConnectionRequest$Type extends MessageType$<WebSocketConnectionRequest> {
    constructor() {
        super("WebSocketConnectionRequest", [
            { no: 1, name: "requester", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "target", kind: "message", T: () => PeerDescriptor },
            { no: 3, name: "ip", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "port", kind: "scalar", T: 13 /*ScalarType.UINT32*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message WebSocketConnectionRequest
 */
export const WebSocketConnectionRequest = new WebSocketConnectionRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class WebSocketConnectionResponse$Type extends MessageType$<WebSocketConnectionResponse> {
    constructor() {
        super("WebSocketConnectionResponse", [
            { no: 1, name: "requester", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "target", kind: "message", T: () => PeerDescriptor },
            { no: 3, name: "accepted", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
            { no: 4, name: "reason", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message WebSocketConnectionResponse
 */
export const WebSocketConnectionResponse = new WebSocketConnectionResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class WebRtcConnectionRequest$Type extends MessageType$<WebRtcConnectionRequest> {
    constructor() {
        super("WebRtcConnectionRequest", [
            { no: 1, name: "requester", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "target", kind: "message", T: () => PeerDescriptor },
            { no: 3, name: "connectionId", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message WebRtcConnectionRequest
 */
export const WebRtcConnectionRequest = new WebRtcConnectionRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RtcOffer$Type extends MessageType$<RtcOffer> {
    constructor() {
        super("RtcOffer", [
            { no: 1, name: "requester", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "target", kind: "message", T: () => PeerDescriptor },
            { no: 3, name: "description", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "connectionId", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message RtcOffer
 */
export const RtcOffer = new RtcOffer$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RtcAnswer$Type extends MessageType$<RtcAnswer> {
    constructor() {
        super("RtcAnswer", [
            { no: 1, name: "requester", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "target", kind: "message", T: () => PeerDescriptor },
            { no: 3, name: "description", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "connectionId", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message RtcAnswer
 */
export const RtcAnswer = new RtcAnswer$Type();
// @generated message type with reflection information, may provide speed optimized methods
class IceCandidate$Type extends MessageType$<IceCandidate> {
    constructor() {
        super("IceCandidate", [
            { no: 1, name: "candidate", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "mid", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "connectionId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "requester", kind: "message", T: () => PeerDescriptor },
            { no: 5, name: "target", kind: "message", T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message IceCandidate
 */
export const IceCandidate = new IceCandidate$Type();
/**
 * @generated ServiceType for protobuf service DhtRpc
 */
export const DhtRpc = new ServiceType("DhtRpc", [
    { name: "getClosestPeers", options: {}, I: ClosestPeersRequest, O: ClosestPeersResponse },
    { name: "ping", options: {}, I: PingRequest, O: PingResponse },
    { name: "routeMessage", options: {}, I: RouteMessageWrapper, O: RouteMessageAck }
]);
/**
 * @generated ServiceType for protobuf service WebSocketConnector
 */
export const WebSocketConnector = new ServiceType("WebSocketConnector", [
    { name: "requestConnection", options: {}, I: WebSocketConnectionRequest, O: WebSocketConnectionResponse }
]);
/**
 * @generated ServiceType for protobuf service WebRtcConnector
 */
export const WebRtcConnector = new ServiceType("WebRtcConnector", [
    { name: "requestConnection", options: {}, I: WebRtcConnectionRequest, O: Empty },
    { name: "rtcOffer", options: {}, I: RtcOffer, O: Empty },
    { name: "rtcAnswer", options: {}, I: RtcAnswer, O: Empty },
    { name: "iceCandidate", options: {}, I: IceCandidate, O: Empty }
]);
