import { ServiceType } from "@protobuf-ts/runtime-rpc";
import { MessageType } from "@protobuf-ts/runtime";
/**
 * @generated from protobuf message autocertifier.SessionIdRequest
 */
export interface SessionIdRequest {
    /**
     * @generated from protobuf field: string sessionId = 1;
     */
    sessionId: string;
}
/**
 * @generated from protobuf message autocertifier.SessionIdResponse
 */
export interface SessionIdResponse {
    /**
     * @generated from protobuf field: optional string error = 1;
     */
    error?: string;
    /**
     * @generated from protobuf field: optional string sessionId = 2;
     */
    sessionId?: string;
}
declare class SessionIdRequest$Type extends MessageType<SessionIdRequest> {
    constructor();
}
/**
 * @generated MessageType for protobuf message autocertifier.SessionIdRequest
 */
export declare const SessionIdRequest: SessionIdRequest$Type;
declare class SessionIdResponse$Type extends MessageType<SessionIdResponse> {
    constructor();
}
/**
 * @generated MessageType for protobuf message autocertifier.SessionIdResponse
 */
export declare const SessionIdResponse: SessionIdResponse$Type;
/**
 * @generated ServiceType for protobuf service autocertifier.AutoCertifierService
 */
export declare const AutoCertifierService: ServiceType;
export {};
