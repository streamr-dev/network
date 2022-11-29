// @generated by protobuf-ts 2.8.0 with parameter server_generic,generate_dependencies
// @generated from protobuf file "packages/trackerless-network/protos/NetworkRpc.proto" (syntax proto3)
// tslint:disable
import { Empty } from "../../../google/protobuf/empty";
import { ServiceType } from "@protobuf-ts/runtime-rpc";
import { MessageType } from "@protobuf-ts/runtime";
import { PeerDescriptor } from "../../dht/protos/DhtRpc";
/**
 * @generated from protobuf message MessageRef
 */
export interface MessageRef {
    /**
     * @generated from protobuf field: int64 timestamp = 1;
     */
    timestamp: bigint;
    /**
     * @generated from protobuf field: int32 sequenceNumber = 2;
     */
    sequenceNumber: number;
    /**
     * @generated from protobuf field: string messageChainId = 3;
     */
    messageChainId: string;
    /**
     * @generated from protobuf field: string streamId = 4;
     */
    streamId: string;
    /**
     * @generated from protobuf field: int32 streamPartition = 5;
     */
    streamPartition: number;
    /**
     * @generated from protobuf field: string publisherId = 6;
     */
    publisherId: string;
}
/**
 * @generated from protobuf message ContentMessage
 */
export interface ContentMessage {
    /**
     * @generated from protobuf field: string body = 1;
     */
    body: string;
}
/**
 * @generated from protobuf message EncryptedGroupKey
 */
export interface EncryptedGroupKey {
    /**
     * @generated from protobuf field: string groupKeyId = 1;
     */
    groupKeyId: string;
    /**
     * @generated from protobuf field: string encryptedGroupKeyHex = 2;
     */
    encryptedGroupKeyHex: string;
    /**
     * @generated from protobuf field: optional string serialized = 3;
     */
    serialized?: string;
}
/**
 * @generated from protobuf message StreamMessage
 */
export interface StreamMessage {
    /**
     * @generated from protobuf field: StreamMessageType messageType = 1;
     */
    messageType: StreamMessageType;
    /**
     * @generated from protobuf field: optional EncryptionType encryptionType = 2;
     */
    encryptionType?: EncryptionType;
    /**
     * @generated from protobuf field: bytes content = 3;
     */
    content: Uint8Array;
    /**
     * @generated from protobuf field: string signature = 4;
     */
    signature: string;
    /**
     * @generated from protobuf field: MessageRef messageRef = 5;
     */
    messageRef?: MessageRef;
    /**
     * @generated from protobuf field: optional MessageRef previousMessageRef = 6;
     */
    previousMessageRef?: MessageRef;
    /**
     * @generated from protobuf field: optional string previousPeer = 7;
     */
    previousPeer?: string;
    /**
     * @generated from protobuf field: optional string groupKeyId = 8;
     */
    groupKeyId?: string;
    /**
     * @generated from protobuf field: optional EncryptedGroupKey newGroupKey = 9;
     */
    newGroupKey?: EncryptedGroupKey;
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
     * @generated from protobuf field: string recipient = 2;
     */
    recipient: string;
    /**
     * @generated from protobuf field: string rsaPublicKey = 3;
     */
    rsaPublicKey: string;
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
     * @generated from protobuf field: string recipient = 2;
     */
    recipient: string;
    /**
     * @generated from protobuf field: repeated EncryptedGroupKey encryptedGroupKeys = 3;
     */
    encryptedGroupKeys: EncryptedGroupKey[];
}
/**
 * @generated from protobuf message Layer2Message
 */
export interface Layer2Message {
    /**
     * @generated from protobuf field: Layer2Type type = 1;
     */
    type: Layer2Type;
}
/**
 * @generated from protobuf message StreamHandshakeRequest
 */
export interface StreamHandshakeRequest {
    /**
     * @generated from protobuf field: string randomGraphId = 1;
     */
    randomGraphId: string;
    /**
     * @generated from protobuf field: string senderId = 2;
     */
    senderId: string;
    /**
     * @generated from protobuf field: string requestId = 3;
     */
    requestId: string;
    /**
     * @generated from protobuf field: optional string concurrentHandshakeTargetId = 4;
     */
    concurrentHandshakeTargetId?: string;
    /**
     * @generated from protobuf field: repeated string neighbors = 5;
     */
    neighbors: string[];
    /**
     * @generated from protobuf field: repeated string peerView = 6;
     */
    peerView: string[];
    /**
     * @generated from protobuf field: PeerDescriptor senderDescriptor = 7;
     */
    senderDescriptor?: PeerDescriptor;
    /**
     * @generated from protobuf field: bool interleaving = 8;
     */
    interleaving: boolean;
    /**
     * @generated from protobuf field: optional string interleavingFrom = 9;
     */
    interleavingFrom?: string;
}
/**
 * @generated from protobuf message StreamHandshakeResponse
 */
export interface StreamHandshakeResponse {
    /**
     * @generated from protobuf field: bool accepted = 1;
     */
    accepted: boolean;
    /**
     * @generated from protobuf field: string requestId = 2;
     */
    requestId: string;
    /**
     * @generated from protobuf field: optional PeerDescriptor interleaveTarget = 3;
     */
    interleaveTarget?: PeerDescriptor;
}
/**
 * @generated from protobuf message InterleaveNotice
 */
export interface InterleaveNotice {
    /**
     * @generated from protobuf field: string senderId = 1;
     */
    senderId: string;
    /**
     * @generated from protobuf field: string randomGraphId = 2;
     */
    randomGraphId: string;
    /**
     * @generated from protobuf field: PeerDescriptor interleaveTarget = 3;
     */
    interleaveTarget?: PeerDescriptor;
}
/**
 * @generated from protobuf message LeaveStreamNotice
 */
export interface LeaveStreamNotice {
    /**
     * @generated from protobuf field: string randomGraphId = 1;
     */
    randomGraphId: string;
    /**
     * @generated from protobuf field: string senderId = 2;
     */
    senderId: string;
}
/**
 * @generated from protobuf message NeighborUpdate
 */
export interface NeighborUpdate {
    /**
     * @generated from protobuf field: string senderId = 1;
     */
    senderId: string;
    /**
     * @generated from protobuf field: string randomGraphId = 2;
     */
    randomGraphId: string;
    /**
     * @generated from protobuf field: bool removeMe = 3;
     */
    removeMe: boolean;
    /**
     * @generated from protobuf field: repeated PeerDescriptor neighborDescriptors = 4;
     */
    neighborDescriptors: PeerDescriptor[];
}
/**
 * @generated from protobuf enum StreamMessageType
 */
export enum StreamMessageType {
    /**
     * @generated from protobuf enum value: MESSAGE = 0;
     */
    MESSAGE = 0,
    /**
     * @generated from protobuf enum value: GROUP_KEY_REQUEST = 1;
     */
    GROUP_KEY_REQUEST = 1,
    /**
     * @generated from protobuf enum value: GROUP_KEY_RESPONSE = 2;
     */
    GROUP_KEY_RESPONSE = 2
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
     * @generated from protobuf enum value: RSA = 1;
     */
    RSA = 1,
    /**
     * @generated from protobuf enum value: AES = 2;
     */
    AES = 2
}
/**
 * @generated from protobuf enum Layer2Type
 */
export enum Layer2Type {
    /**
     * @generated from protobuf enum value: Data = 0;
     */
    Data = 0
}
// @generated message type with reflection information, may provide speed optimized methods
class MessageRef$Type extends MessageType<MessageRef> {
    constructor() {
        super("MessageRef", [
            { no: 1, name: "timestamp", kind: "scalar", T: 3 /*ScalarType.INT64*/, L: 0 /*LongType.BIGINT*/ },
            { no: 2, name: "sequenceNumber", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
            { no: 3, name: "messageChainId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "streamId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 5, name: "streamPartition", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
            { no: 6, name: "publisherId", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message MessageRef
 */
export const MessageRef = new MessageRef$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ContentMessage$Type extends MessageType<ContentMessage> {
    constructor() {
        super("ContentMessage", [
            { no: 1, name: "body", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ContentMessage
 */
export const ContentMessage = new ContentMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class EncryptedGroupKey$Type extends MessageType<EncryptedGroupKey> {
    constructor() {
        super("EncryptedGroupKey", [
            { no: 1, name: "groupKeyId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "encryptedGroupKeyHex", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "serialized", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message EncryptedGroupKey
 */
export const EncryptedGroupKey = new EncryptedGroupKey$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamMessage$Type extends MessageType<StreamMessage> {
    constructor() {
        super("StreamMessage", [
            { no: 1, name: "messageType", kind: "enum", T: () => ["StreamMessageType", StreamMessageType] },
            { no: 2, name: "encryptionType", kind: "enum", opt: true, T: () => ["EncryptionType", EncryptionType] },
            { no: 3, name: "content", kind: "scalar", T: 12 /*ScalarType.BYTES*/ },
            { no: 4, name: "signature", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 5, name: "messageRef", kind: "message", T: () => MessageRef },
            { no: 6, name: "previousMessageRef", kind: "message", T: () => MessageRef },
            { no: 7, name: "previousPeer", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ },
            { no: 8, name: "groupKeyId", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ },
            { no: 9, name: "newGroupKey", kind: "message", T: () => EncryptedGroupKey }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message StreamMessage
 */
export const StreamMessage = new StreamMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class GroupKeyRequest$Type extends MessageType<GroupKeyRequest> {
    constructor() {
        super("GroupKeyRequest", [
            { no: 1, name: "requestId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "recipient", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "rsaPublicKey", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
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
            { no: 2, name: "recipient", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "encryptedGroupKeys", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => EncryptedGroupKey }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message GroupKeyResponse
 */
export const GroupKeyResponse = new GroupKeyResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class Layer2Message$Type extends MessageType<Layer2Message> {
    constructor() {
        super("Layer2Message", [
            { no: 1, name: "type", kind: "enum", T: () => ["Layer2Type", Layer2Type] }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message Layer2Message
 */
export const Layer2Message = new Layer2Message$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamHandshakeRequest$Type extends MessageType<StreamHandshakeRequest> {
    constructor() {
        super("StreamHandshakeRequest", [
            { no: 1, name: "randomGraphId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "senderId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "requestId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "concurrentHandshakeTargetId", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ },
            { no: 5, name: "neighbors", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
            { no: 6, name: "peerView", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
            { no: 7, name: "senderDescriptor", kind: "message", T: () => PeerDescriptor },
            { no: 8, name: "interleaving", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
            { no: 9, name: "interleavingFrom", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message StreamHandshakeRequest
 */
export const StreamHandshakeRequest = new StreamHandshakeRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class StreamHandshakeResponse$Type extends MessageType<StreamHandshakeResponse> {
    constructor() {
        super("StreamHandshakeResponse", [
            { no: 1, name: "accepted", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
            { no: 2, name: "requestId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "interleaveTarget", kind: "message", T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message StreamHandshakeResponse
 */
export const StreamHandshakeResponse = new StreamHandshakeResponse$Type();
// @generated message type with reflection information, may provide speed optimized methods
class InterleaveNotice$Type extends MessageType<InterleaveNotice> {
    constructor() {
        super("InterleaveNotice", [
            { no: 1, name: "senderId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "randomGraphId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "interleaveTarget", kind: "message", T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message InterleaveNotice
 */
export const InterleaveNotice = new InterleaveNotice$Type();
// @generated message type with reflection information, may provide speed optimized methods
class LeaveStreamNotice$Type extends MessageType<LeaveStreamNotice> {
    constructor() {
        super("LeaveStreamNotice", [
            { no: 1, name: "randomGraphId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "senderId", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message LeaveStreamNotice
 */
export const LeaveStreamNotice = new LeaveStreamNotice$Type();
// @generated message type with reflection information, may provide speed optimized methods
class NeighborUpdate$Type extends MessageType<NeighborUpdate> {
    constructor() {
        super("NeighborUpdate", [
            { no: 1, name: "senderId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "randomGraphId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "removeMe", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
            { no: 4, name: "neighborDescriptors", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message NeighborUpdate
 */
export const NeighborUpdate = new NeighborUpdate$Type();
/**
 * @generated ServiceType for protobuf service NetworkRpc
 */
export const NetworkRpc = new ServiceType("NetworkRpc", [
    { name: "sendData", options: {}, I: StreamMessage, O: Empty },
    { name: "handshake", options: {}, I: StreamHandshakeRequest, O: StreamHandshakeResponse },
    { name: "leaveStreamNotice", options: {}, I: LeaveStreamNotice, O: Empty },
    { name: "interleaveNotice", options: {}, I: InterleaveNotice, O: Empty },
    { name: "neighborUpdate", options: {}, I: NeighborUpdate, O: NeighborUpdate }
]);
