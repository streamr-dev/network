import type { RpcTransport } from "@protobuf-ts/runtime-rpc";
import type { ServiceInfo } from "@protobuf-ts/runtime-rpc";
import type { SessionIdResponse } from "./AutoCertifier";
import type { SessionIdRequest } from "./AutoCertifier";
import type { UnaryCall } from "@protobuf-ts/runtime-rpc";
import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service autocertifier.AutoCertifierService
 */
export interface IAutoCertifierServiceClient {
    /**
     * @generated from protobuf rpc: getSessionId(autocertifier.SessionIdRequest) returns (autocertifier.SessionIdResponse);
     */
    getSessionId(input: SessionIdRequest, options?: RpcOptions): UnaryCall<SessionIdRequest, SessionIdResponse>;
}
/**
 * @generated from protobuf service autocertifier.AutoCertifierService
 */
export declare class AutoCertifierServiceClient implements IAutoCertifierServiceClient, ServiceInfo {
    private readonly _transport;
    typeName: string;
    methods: import("@protobuf-ts/runtime-rpc").MethodInfo<any, any>[];
    options: {
        [extensionName: string]: import("@protobuf-ts/runtime").JsonValue;
    };
    constructor(_transport: RpcTransport);
    /**
     * @generated from protobuf rpc: getSessionId(autocertifier.SessionIdRequest) returns (autocertifier.SessionIdResponse);
     */
    getSessionId(input: SessionIdRequest, options?: RpcOptions): UnaryCall<SessionIdRequest, SessionIdResponse>;
}
