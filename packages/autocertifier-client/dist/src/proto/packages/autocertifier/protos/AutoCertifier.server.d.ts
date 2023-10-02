import { SessionIdResponse } from "./AutoCertifier";
import { SessionIdRequest } from "./AutoCertifier";
import { ServerCallContext } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service autocertifier.AutoCertifierService
 */
export interface IAutoCertifierService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: getSessionId(autocertifier.SessionIdRequest) returns (autocertifier.SessionIdResponse);
     */
    getSessionId(request: SessionIdRequest, context: T): Promise<SessionIdResponse>;
}
