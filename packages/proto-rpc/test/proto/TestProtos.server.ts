// @generated by protobuf-ts 2.9.4 with parameter server_generic,generate_dependencies
// @generated from protobuf file "TestProtos.proto" (syntax proto3)
// tslint:disable
import { OptionalResponse } from "./TestProtos";
import { OptionalRequest } from "./TestProtos";
import { RouteMessageAck } from "./TestProtos";
import { RouteMessageWrapper } from "./TestProtos";
import { PingResponse } from "./TestProtos";
import { PingRequest } from "./TestProtos";
import { ClosestPeersResponse } from "./TestProtos";
import { ClosestPeersRequest } from "./TestProtos";
import { ServerCallContext } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service DhtRpcService
 */
export interface IDhtRpcService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: getClosestPeers(ClosestPeersRequest) returns (ClosestPeersResponse);
     */
    getClosestPeers(request: ClosestPeersRequest, context: T): Promise<ClosestPeersResponse>;
    /**
     * @generated from protobuf rpc: ping(PingRequest) returns (PingResponse);
     */
    ping(request: PingRequest, context: T): Promise<PingResponse>;
    /**
     * @generated from protobuf rpc: routeMessage(RouteMessageWrapper) returns (RouteMessageAck);
     */
    routeMessage(request: RouteMessageWrapper, context: T): Promise<RouteMessageAck>;
}
/**
 * @generated from protobuf service OptionalService
 */
export interface IOptionalService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: getOptional(OptionalRequest) returns (OptionalResponse);
     */
    getOptional(request: OptionalRequest, context: T): Promise<OptionalResponse>;
}
