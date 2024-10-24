// @generated by protobuf-ts 2.9.4 with parameter server_generic,generate_dependencies
// @generated from protobuf file "ProtoRpc.proto" (package "protorpc", syntax proto3)
// tslint:disable
import { MessageType } from "@protobuf-ts/runtime";
import { Empty } from "./google/protobuf/empty";
import { Any } from "./google/protobuf/any";
/**
 * @generated from protobuf message protorpc.RpcMessage
 */
export interface RpcMessage {
    /**
     * @generated from protobuf field: map<string, string> header = 1;
     */
    header: {
        [key: string]: string;
    };
    /**
     * @generated from protobuf field: google.protobuf.Any body = 2;
     */
    body?: Any;
    /**
     * @generated from protobuf field: string requestId = 3;
     */
    requestId: string;
    /**
     * @generated from protobuf field: optional protorpc.RpcErrorType errorType = 4;
     */
    errorType?: RpcErrorType;
    /**
     * @generated from protobuf field: optional string errorClassName = 5;
     */
    errorClassName?: string;
    /**
     * @generated from protobuf field: optional string errorCode = 6;
     */
    errorCode?: string;
    /**
     * @generated from protobuf field: optional string errorMessage = 7;
     */
    errorMessage?: string;
}
// Dummy message to force the generation of the typescript class "google.prototype.Empty"
// We need this generated class in RpcCommunicator

/**
 * @generated from protobuf message protorpc.Mnfo2uhnf92hvqi2nviouq2hv9puhq
 */
export interface Mnfo2uhnf92hvqi2nviouq2hv9puhq {
    /**
     * @generated from protobuf field: google.protobuf.Empty empty = 1;
     */
    empty?: Empty;
}
/**
 * @generated from protobuf enum protorpc.RpcErrorType
 */
export enum RpcErrorType {
    /**
     * @generated from protobuf enum value: SERVER_TIMEOUT = 0;
     */
    SERVER_TIMEOUT = 0,
    /**
     * @generated from protobuf enum value: CLIENT_TIMEOUT = 1;
     */
    CLIENT_TIMEOUT = 1,
    /**
     * @generated from protobuf enum value: UNKNOWN_RPC_METHOD = 2;
     */
    UNKNOWN_RPC_METHOD = 2,
    /**
     * @generated from protobuf enum value: CLIENT_ERROR = 3;
     */
    CLIENT_ERROR = 3,
    /**
     * @generated from protobuf enum value: SERVER_ERROR = 4;
     */
    SERVER_ERROR = 4
}
// @generated message type with reflection information, may provide speed optimized methods
class RpcMessage$Type extends MessageType<RpcMessage> {
    constructor() {
        super("protorpc.RpcMessage", [
            { no: 1, name: "header", kind: "map", K: 9 /*ScalarType.STRING*/, V: { kind: "scalar", T: 9 /*ScalarType.STRING*/ } },
            { no: 2, name: "body", kind: "message", T: () => Any },
            { no: 3, name: "requestId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "errorType", kind: "enum", opt: true, T: () => ["protorpc.RpcErrorType", RpcErrorType] },
            { no: 5, name: "errorClassName", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ },
            { no: 6, name: "errorCode", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ },
            { no: 7, name: "errorMessage", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message protorpc.RpcMessage
 */
export const RpcMessage = new RpcMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class Mnfo2uhnf92hvqi2nviouq2hv9puhq$Type extends MessageType<Mnfo2uhnf92hvqi2nviouq2hv9puhq> {
    constructor() {
        super("protorpc.Mnfo2uhnf92hvqi2nviouq2hv9puhq", [
            { no: 1, name: "empty", kind: "message", T: () => Empty }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message protorpc.Mnfo2uhnf92hvqi2nviouq2hv9puhq
 */
export const Mnfo2uhnf92hvqi2nviouq2hv9puhq = new Mnfo2uhnf92hvqi2nviouq2hv9puhq$Type();
