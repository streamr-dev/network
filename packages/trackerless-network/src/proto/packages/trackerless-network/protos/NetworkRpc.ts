// @generated by protobuf-ts 2.9.4 with parameter server_generic,generate_dependencies,long_type_number
// @generated from protobuf file "packages/trackerless-network/protos/NetworkRpc.proto" (syntax proto3)
// tslint:disable
import { Empty } from "../../../google/protobuf/empty";
import { ServiceType } from "@protobuf-ts/runtime-rpc";
import { MessageType } from "@protobuf-ts/runtime";
import { PeerDescriptor } from "../../dht/protos/DhtRpc";
/**
 * @generated from protobuf message MessageID
 */
export interface MessageID {
    /**
     * @generated from protobuf field: string streamId = 1;
     */
    streamId: string;
    /**
     * @generated from protobuf field: int32 streamPartition = 2;
     */
    streamPartition: number;
    /**
     * @generated from protobuf field: int64 timestamp = 3;
     */
    timestamp: number;
    /**
     * @generated from protobuf field: int32 sequenceNumber = 4;
     */
    sequenceNumber: number;
    /**
     * @generated from protobuf field: bytes publisherId = 5;
     */
    publisherId: Uint8Array;
    /**
     * @generated from protobuf field: string messageChainId = 6;
     */
    messageChainId: string;
}
/**
 * @generated from protobuf message MessageRef
 */
export interface MessageRef {
    /**
     * @generated from protobuf field: int64 timestamp = 1;
     */
    timestamp: number;
    /**
     * @generated from protobuf field: int32 sequenceNumber = 2;
     */
    sequenceNumber: number;
}
/**
 * @generated from protobuf message StreamMessage
 */
export interface StreamMessage {
    /**
     * this is a required field but in generated NetworkRpc.ts it is incorrectly annotated as optional (NET-1082)
     *
     * @generated from protobuf field: MessageID messageId = 1;
     */
    messageId?: MessageID;
    /**
     * @generated from protobuf field: optional MessageRef previousMessageRef = 2;
     */
    previousMessageRef?: MessageRef;
    /**
     * @generated from protobuf field: bytes signature = 3;
     */
    signature: Uint8Array;
    /**
     * @generated from protobuf field: SignatureType signatureType = 4;
     */
    signatureType: SignatureType;
    /**
     * @generated from protobuf oneof: body
     */
    body: {
        oneofKind: "contentMessage";
        /**
         * @generated from protobuf field: ContentMessage contentMessage = 5;
         */
        contentMessage: ContentMessage;
    } | {
        oneofKind: "groupKeyRequest";
        /**
         * @generated from protobuf field: GroupKeyRequest groupKeyRequest = 6;
         */
        groupKeyRequest: GroupKeyRequest;
    } | {
        oneofKind: "groupKeyResponse";
        /**
         * @generated from protobuf field: GroupKeyResponse groupKeyResponse = 7;
         */
        groupKeyResponse: GroupKeyResponse;
    } | {
        oneofKind: undefined;
    };
}
/**
 * @generated from protobuf message ContentMessage
 */
export interface ContentMessage {
    /**
     * @generated from protobuf field: bytes content = 1;
     */
    content: Uint8Array;
    /**
     * @generated from protobuf field: ContentType contentType = 2;
     */
    contentType: ContentType;
    /**
     * @generated from protobuf field: EncryptionType encryptionType = 3;
     */
    encryptionType: EncryptionType;
    /**
     * @generated from protobuf field: optional string groupKeyId = 4;
     */
    groupKeyId?: string;
    /**
     * @generated from protobuf field: optional GroupKey newGroupKey = 5;
     */
    newGroupKey?: GroupKey;
}
/**
 * @generated from protobuf message GroupKeyRequest
 */
export interface GroupKeyRequest {
    /**
     * @generated from protobuf field: string requestId = 1;
     */
    requestId: string;
    /**
     * @generated from protobuf field: bytes recipientId = 2;
     */
    recipientId: Uint8Array;
    /**
     * @generated from protobuf field: bytes rsaPublicKey = 3;
     */
    rsaPublicKey: Uint8Array;
    /**
     * @generated from protobuf field: repeated string groupKeyIds = 4;
     */
    groupKeyIds: string[];
}
/**
 * @generated from protobuf message GroupKeyResponse
 */
export interface GroupKeyResponse {
    /**
     * @generated from protobuf field: string requestId = 1;
     */
    requestId: string;
    /**
     * @generated from protobuf field: bytes recipientId = 2;
     */
    recipientId: Uint8Array;
    /**
     * @generated from protobuf field: repeated GroupKey groupKeys = 3;
     */
    groupKeys: GroupKey[];
}
/**
 * @generated from protobuf message GroupKey
 */
export interface GroupKey {
    /**
     * @generated from protobuf field: string id = 1;
     */
    id: string;
    /**
     * @generated from protobuf field: bytes data = 2;
     */
    data: Uint8Array;
}
/**
 * @generated from protobuf message StreamPartHandshakeRequest
 */
export interface StreamPartHandshakeRequest {
    /**
     * @generated from protobuf field: string streamPartId = 1;
     */
    streamPartId: string;
    /**
     * @generated from protobuf field: string requestId = 2;
     */
    requestId: string;
    /**
     * @generated from protobuf field: optional bytes concurrentHandshakeNodeId = 3;
     */
    concurrentHandshakeNodeId?: Uint8Array;
    /**
     * @generated from protobuf field: repeated bytes neighborNodeIds = 4;
     */
    neighborNodeIds: Uint8Array[];
    /**
     * @generated from protobuf field: optional bytes interleaveNodeId = 5;
     */
    interleaveNodeId?: Uint8Array;
}
/**
 * @generated from protobuf message StreamPartHandshakeResponse
 */
export interface StreamPartHandshakeResponse {
    /**
     * @generated from protobuf field: bool accepted = 1;
     */
    accepted: boolean;
    /**
     * @generated from protobuf field: string requestId = 2;
     */
    requestId: string;
    /**
     * @generated from protobuf field: optional dht.PeerDescriptor interleaveTargetDescriptor = 3;
     */
    interleaveTargetDescriptor?: PeerDescriptor;
}
/**
 * @generated from protobuf message InterleaveRequest
 */
export interface InterleaveRequest {
    /**
     * this is a required field but in generated NetworkRpc.ts it is incorrectly annotated as optional (NET-1082)
     *
     * @generated from protobuf field: dht.PeerDescriptor interleaveTargetDescriptor = 1;
     */
    interleaveTargetDescriptor?: PeerDescriptor;
}
/**
 * @generated from protobuf message InterleaveResponse
 */
export interface InterleaveResponse {
    /**
     * @generated from protobuf field: bool accepted = 1;
     */
    accepted: boolean;
}
/**
 * @generated from protobuf message LeaveStreamPartNotice
 */
export interface LeaveStreamPartNotice {
    /**
     * @generated from protobuf field: string streamPartId = 1;
     */
    streamPartId: string;
    /**
     * @generated from protobuf field: bool isEntryPoint = 2;
     */
    isEntryPoint: boolean;
}
/**
 * @generated from protobuf message NeighborUpdate
 */
export interface NeighborUpdate {
    /**
     * @generated from protobuf field: string streamPartId = 1;
     */
    streamPartId: string;
    /**
     * @generated from protobuf field: bool removeMe = 2;
     */
    removeMe: boolean;
    /**
     * @generated from protobuf field: repeated dht.PeerDescriptor neighborDescriptors = 3;
     */
    neighborDescriptors: PeerDescriptor[];
}
/**
 * @generated from protobuf message ProxyConnectionRequest
 */
export interface ProxyConnectionRequest {
    /**
     * @generated from protobuf field: ProxyDirection direction = 1;
     */
    direction: ProxyDirection;
    /**
     * @generated from protobuf field: bytes userId = 2;
     */
    userId: Uint8Array;
}
/**
 * @generated from protobuf message ProxyConnectionResponse
 */
export interface ProxyConnectionResponse {
    /**
     * @generated from protobuf field: bool accepted = 1;
     */
    accepted: boolean;
}
/**
 * @generated from protobuf message TemporaryConnectionRequest
 */
export interface TemporaryConnectionRequest {
}
/**
 * @generated from protobuf message TemporaryConnectionResponse
 */
export interface TemporaryConnectionResponse {
    /**
     * @generated from protobuf field: bool accepted = 1;
     */
    accepted: boolean;
}
/**
 * @generated from protobuf message CloseTemporaryConnection
 */
export interface CloseTemporaryConnection {
}
/**
 * @generated from protobuf message StreamPartitionInfo
 */
export interface StreamPartitionInfo {
    /**
     * @generated from protobuf field: string id = 1;
     */
    id: string;
    /**
     * @generated from protobuf field: repeated dht.PeerDescriptor controlLayerNeighbors = 2;
     */
    controlLayerNeighbors: PeerDescriptor[];
    /**
     * @generated from protobuf field: repeated ContentDeliveryLayerNeighborInfo contentDeliveryLayerNeighbors = 3;
     */
    contentDeliveryLayerNeighbors: ContentDeliveryLayerNeighborInfo[];
}
/**
 * @generated from protobuf message ContentDeliveryLayerNeighborInfo
 */
export interface ContentDeliveryLayerNeighborInfo {
    /**
     * @generated from protobuf field: dht.PeerDescriptor peerDescriptor = 1;
     */
    peerDescriptor?: PeerDescriptor;
    /**
     * @generated from protobuf field: optional int32 rtt = 2;
     */
    rtt?: number;
}
/**
 * @generated from protobuf message ControlLayerInfo
 */
export interface ControlLayerInfo {
    /**
     * @generated from protobuf field: repeated dht.PeerDescriptor neighbors = 1;
     */
    neighbors: PeerDescriptor[];
    /**
     * @generated from protobuf field: repeated dht.PeerDescriptor connections = 2;
     */
    connections: PeerDescriptor[];
}
/**
 * @generated from protobuf message NodeInfoRequest
 */
export interface NodeInfoRequest {
}
/**
 * @generated from protobuf message NodeInfoResponse
 */
export interface NodeInfoResponse {
    /**
     * @generated from protobuf field: dht.PeerDescriptor peerDescriptor = 1;
     */
    peerDescriptor?: PeerDescriptor;
    /**
     * @generated from protobuf field: repeated StreamPartitionInfo streamPartitions = 2;
     */
    streamPartitions: StreamPartitionInfo[];
    /**
     * @generated from protobuf field: optional ControlLayerInfo controlLayer = 3;
     */
    controlLayer?: ControlLayerInfo;
    /**
     * @generated from protobuf field: string version = 4;
     */
    version: string;
}
/**
 * @generated from protobuf enum ContentType
 */
export enum ContentType {
    /**
     * @generated from protobuf enum value: JSON = 0;
     */
    JSON = 0,
    /**
     * @generated from protobuf enum value: BINARY = 1;
     */
    BINARY = 1
}
/**
 * @generated from protobuf enum EncryptionType
 */
export enum EncryptionType {
    /**
     * @generated from protobuf enum value: NONE = 0;
     */
    NONE = 0,
    /**
     * @generated from protobuf enum value: AES = 1;
     */
    AES = 1
}
/**
 * @generated from protobuf enum SignatureType
 */
export enum SignatureType {
    /**
     * @generated from protobuf enum value: LEGACY_SECP256K1 = 0;
     */
    LEGACY_SECP256K1 = 0,
    /**
     * @generated from protobuf enum value: SECP256K1 = 1;
     */
    SECP256K1 = 1,
    /**
     * @generated from protobuf enum value: ERC_1271 = 2;
     */
    ERC_1271 = 2
}
/**
 * @generated from protobuf enum ProxyDirection
 */
export enum ProxyDirection {
    /**
     * @generated from protobuf enum value: PUBLISH = 0;
     */
    PUBLISH = 0,
    /**
     * @generated from protobuf enum value: SUBSCRIBE = 1;
     */
    SUBSCRIBE = 1
}
// @generated message type with reflection information, may provide speed optimized methods
class MessageID$Type extends MessageType<MessageID> {
    constructor() {
        super("MessageID", [
            { no: 1, name: "streamId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "streamPartition", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
            { no: 3, name: "timestamp", kind: "scalar", T: 3 /*ScalarType.INT64*/, L: 2 /*LongType.NUMBER*/ },
            { no: 4, name: "sequenceNumber", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
            { no: 5, name: "publisherId", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 6, name: "messageChainId", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message MessageID
 */
export const MessageID = new MessageID$Type();
// @generated message type with reflection information, may provide speed optimized methods
class MessageRef$Type extends MessageType<MessageRef> {
    constructor() {
        super("MessageRef", [
            { no: 1, name: "timestamp", kind: "scalar", T: 3 /*ScalarType.INT64*/, L: 2 /*LongType.NUMBER*/ },
            { no: 2, name: "sequenceNumber", kind: "scalar", T: 5 /*ScalarType.INT32*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message MessageRef
 */
export const MessageRef = new MessageRef$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamMessage$Type extends MessageType<StreamMessage> {
    constructor() {
        super("StreamMessage", [
            { no: 1, name: "messageId", kind: "message", T: () => MessageID },
            { no: 2, name: "previousMessageRef", kind: "message", T: () => MessageRef },
            { no: 3, name: "signature", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 4, name: "signatureType", kind: "enum", T: () => ["SignatureType", SignatureType] },
            { no: 5, name: "contentMessage", kind: "message", oneof: "body", T: () => ContentMessage },
            { no: 6, name: "groupKeyRequest", kind: "message", oneof: "body", T: () => GroupKeyRequest },
            { no: 7, name: "groupKeyResponse", kind: "message", oneof: "body", T: () => GroupKeyResponse }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message StreamMessage
 */
export const StreamMessage = new StreamMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ContentMessage$Type extends MessageType<ContentMessage> {
    constructor() {
        super("ContentMessage", [
            { no: 1, name: "content", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 2, name: "contentType", kind: "enum", T: () => ["ContentType", ContentType] },
            { no: 3, name: "encryptionType", kind: "enum", T: () => ["EncryptionType", EncryptionType] },
            { no: 4, name: "groupKeyId", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ },
            { no: 5, name: "newGroupKey", kind: "message", T: () => GroupKey }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ContentMessage
 */
export const ContentMessage = new ContentMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class GroupKeyRequest$Type extends MessageType<GroupKeyRequest> {
    constructor() {
        super("GroupKeyRequest", [
            { no: 1, name: "requestId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "recipientId", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 3, name: "rsaPublicKey", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 4, name: "groupKeyIds", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message GroupKeyRequest
 */
export const GroupKeyRequest = new GroupKeyRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class GroupKeyResponse$Type extends MessageType<GroupKeyResponse> {
    constructor() {
        super("GroupKeyResponse", [
            { no: 1, name: "requestId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "recipientId", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 3, name: "groupKeys", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => GroupKey }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message GroupKeyResponse
 */
export const GroupKeyResponse = new GroupKeyResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class GroupKey$Type extends MessageType<GroupKey> {
    constructor() {
        super("GroupKey", [
            { no: 1, name: "id", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "data", kind: "scalar", T: 12 /*ScalarType.BYTES*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message GroupKey
 */
export const GroupKey = new GroupKey$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamPartHandshakeRequest$Type extends MessageType<StreamPartHandshakeRequest> {
    constructor() {
        super("StreamPartHandshakeRequest", [
            { no: 1, name: "streamPartId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "requestId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "concurrentHandshakeNodeId", kind: "scalar", opt: true, T: 12 /*ScalarType.BYTES*/ },
            { no: 4, name: "neighborNodeIds", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 12 /*ScalarType.BYTES*/ },
            { no: 5, name: "interleaveNodeId", kind: "scalar", opt: true, T: 12 /*ScalarType.BYTES*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message StreamPartHandshakeRequest
 */
export const StreamPartHandshakeRequest = new StreamPartHandshakeRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamPartHandshakeResponse$Type extends MessageType<StreamPartHandshakeResponse> {
    constructor() {
        super("StreamPartHandshakeResponse", [
            { no: 1, name: "accepted", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
            { no: 2, name: "requestId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "interleaveTargetDescriptor", kind: "message", T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message StreamPartHandshakeResponse
 */
export const StreamPartHandshakeResponse = new StreamPartHandshakeResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class InterleaveRequest$Type extends MessageType<InterleaveRequest> {
    constructor() {
        super("InterleaveRequest", [
            { no: 1, name: "interleaveTargetDescriptor", kind: "message", T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message InterleaveRequest
 */
export const InterleaveRequest = new InterleaveRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class InterleaveResponse$Type extends MessageType<InterleaveResponse> {
    constructor() {
        super("InterleaveResponse", [
            { no: 1, name: "accepted", kind: "scalar", T: 8 /*ScalarType.BOOL*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message InterleaveResponse
 */
export const InterleaveResponse = new InterleaveResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class LeaveStreamPartNotice$Type extends MessageType<LeaveStreamPartNotice> {
    constructor() {
        super("LeaveStreamPartNotice", [
            { no: 1, name: "streamPartId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "isEntryPoint", kind: "scalar", T: 8 /*ScalarType.BOOL*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message LeaveStreamPartNotice
 */
export const LeaveStreamPartNotice = new LeaveStreamPartNotice$Type();
// @generated message type with reflection information, may provide speed optimized methods
class NeighborUpdate$Type extends MessageType<NeighborUpdate> {
    constructor() {
        super("NeighborUpdate", [
            { no: 1, name: "streamPartId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "removeMe", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
            { no: 3, name: "neighborDescriptors", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message NeighborUpdate
 */
export const NeighborUpdate = new NeighborUpdate$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ProxyConnectionRequest$Type extends MessageType<ProxyConnectionRequest> {
    constructor() {
        super("ProxyConnectionRequest", [
            { no: 1, name: "direction", kind: "enum", T: () => ["ProxyDirection", ProxyDirection] },
            { no: 2, name: "userId", kind: "scalar", T: 12 /*ScalarType.BYTES*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ProxyConnectionRequest
 */
export const ProxyConnectionRequest = new ProxyConnectionRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ProxyConnectionResponse$Type extends MessageType<ProxyConnectionResponse> {
    constructor() {
        super("ProxyConnectionResponse", [
            { no: 1, name: "accepted", kind: "scalar", T: 8 /*ScalarType.BOOL*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ProxyConnectionResponse
 */
export const ProxyConnectionResponse = new ProxyConnectionResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class TemporaryConnectionRequest$Type extends MessageType<TemporaryConnectionRequest> {
    constructor() {
        super("TemporaryConnectionRequest", []);
    }
}
/**
 * @generated MessageType for protobuf message TemporaryConnectionRequest
 */
export const TemporaryConnectionRequest = new TemporaryConnectionRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class TemporaryConnectionResponse$Type extends MessageType<TemporaryConnectionResponse> {
    constructor() {
        super("TemporaryConnectionResponse", [
            { no: 1, name: "accepted", kind: "scalar", T: 8 /*ScalarType.BOOL*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message TemporaryConnectionResponse
 */
export const TemporaryConnectionResponse = new TemporaryConnectionResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class CloseTemporaryConnection$Type extends MessageType<CloseTemporaryConnection> {
    constructor() {
        super("CloseTemporaryConnection", []);
    }
}
/**
 * @generated MessageType for protobuf message CloseTemporaryConnection
 */
export const CloseTemporaryConnection = new CloseTemporaryConnection$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamPartitionInfo$Type extends MessageType<StreamPartitionInfo> {
    constructor() {
        super("StreamPartitionInfo", [
            { no: 1, name: "id", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "controlLayerNeighbors", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor },
            { no: 3, name: "contentDeliveryLayerNeighbors", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => ContentDeliveryLayerNeighborInfo }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message StreamPartitionInfo
 */
export const StreamPartitionInfo = new StreamPartitionInfo$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ContentDeliveryLayerNeighborInfo$Type extends MessageType<ContentDeliveryLayerNeighborInfo> {
    constructor() {
        super("ContentDeliveryLayerNeighborInfo", [
            { no: 1, name: "peerDescriptor", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "rtt", kind: "scalar", opt: true, T: 5 /*ScalarType.INT32*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ContentDeliveryLayerNeighborInfo
 */
export const ContentDeliveryLayerNeighborInfo = new ContentDeliveryLayerNeighborInfo$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ControlLayerInfo$Type extends MessageType<ControlLayerInfo> {
    constructor() {
        super("ControlLayerInfo", [
            { no: 1, name: "neighbors", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor },
            { no: 2, name: "connections", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ControlLayerInfo
 */
export const ControlLayerInfo = new ControlLayerInfo$Type();
// @generated message type with reflection information, may provide speed optimized methods
class NodeInfoRequest$Type extends MessageType<NodeInfoRequest> {
    constructor() {
        super("NodeInfoRequest", []);
    }
}
/**
 * @generated MessageType for protobuf message NodeInfoRequest
 */
export const NodeInfoRequest = new NodeInfoRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class NodeInfoResponse$Type extends MessageType<NodeInfoResponse> {
    constructor() {
        super("NodeInfoResponse", [
            { no: 1, name: "peerDescriptor", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "streamPartitions", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => StreamPartitionInfo },
            { no: 3, name: "controlLayer", kind: "message", T: () => ControlLayerInfo },
            { no: 4, name: "version", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message NodeInfoResponse
 */
export const NodeInfoResponse = new NodeInfoResponse$Type();
/**
 * @generated ServiceType for protobuf service ContentDeliveryRpc
 */
export const ContentDeliveryRpc = new ServiceType("ContentDeliveryRpc", [
    { name: "sendStreamMessage", options: {}, I: StreamMessage, O: Empty },
    { name: "leaveStreamPartNotice", options: {}, I: LeaveStreamPartNotice, O: Empty }
]);
/**
 * @generated ServiceType for protobuf service ProxyConnectionRpc
 */
export const ProxyConnectionRpc = new ServiceType("ProxyConnectionRpc", [
    { name: "requestConnection", options: {}, I: ProxyConnectionRequest, O: ProxyConnectionResponse }
]);
/**
 * @generated ServiceType for protobuf service HandshakeRpc
 */
export const HandshakeRpc = new ServiceType("HandshakeRpc", [
    { name: "handshake", options: {}, I: StreamPartHandshakeRequest, O: StreamPartHandshakeResponse },
    { name: "interleaveRequest", options: {}, I: InterleaveRequest, O: InterleaveResponse }
]);
/**
 * @generated ServiceType for protobuf service NeighborUpdateRpc
 */
export const NeighborUpdateRpc = new ServiceType("NeighborUpdateRpc", [
    { name: "neighborUpdate", options: {}, I: NeighborUpdate, O: NeighborUpdate }
]);
/**
 * @generated ServiceType for protobuf service TemporaryConnectionRpc
 */
export const TemporaryConnectionRpc = new ServiceType("TemporaryConnectionRpc", [
    { name: "openConnection", options: {}, I: TemporaryConnectionRequest, O: TemporaryConnectionResponse },
    { name: "closeConnection", options: {}, I: CloseTemporaryConnection, O: Empty }
]);
/**
 * @generated ServiceType for protobuf service NodeInfoRpc
 */
export const NodeInfoRpc = new ServiceType("NodeInfoRpc", [
    { name: "getInfo", options: {}, I: NodeInfoRequest, O: NodeInfoResponse }
]);
