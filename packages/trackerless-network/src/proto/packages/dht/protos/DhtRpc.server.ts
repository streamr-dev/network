// @generated by protobuf-ts 2.8.2 with parameter server_generic,generate_dependencies,long_type_number
// @generated from protobuf file "packages/dht/protos/DhtRpc.proto" (package "dht", syntax proto3)
// tslint:disable
import { DisconnectNotice } from "./DhtRpc";
import { UnlockRequest } from "./DhtRpc";
import { LockResponse } from "./DhtRpc";
import { LockRequest } from "./DhtRpc";
import { IceCandidate } from "./DhtRpc";
import { RtcAnswer } from "./DhtRpc";
import { RtcOffer } from "./DhtRpc";
import { WebRtcConnectionRequest } from "./DhtRpc";
import { WebSocketConnectionResponse } from "./DhtRpc";
import { WebSocketConnectionRequest } from "./DhtRpc";
import { RecursiveFindReport } from "./DhtRpc";
import { StoreDataResponse } from "./DhtRpc";
import { StoreDataRequest } from "./DhtRpc";
import { RouteMessageAck } from "./DhtRpc";
import { RouteMessageWrapper } from "./DhtRpc";
import { Empty } from "../../../google/protobuf/empty";
import { LeaveNotice } from "./DhtRpc";
import { PingResponse } from "./DhtRpc";
import { PingRequest } from "./DhtRpc";
import { ClosestPeersResponse } from "./DhtRpc";
import { ClosestPeersRequest } from "./DhtRpc";
import { ServerCallContext } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service dht.DhtRpcService
 */
export interface IDhtRpcService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: getClosestPeers(dht.ClosestPeersRequest) returns (dht.ClosestPeersResponse);
     */
    getClosestPeers(request: ClosestPeersRequest, context: T): Promise<ClosestPeersResponse>;
    /**
     * @generated from protobuf rpc: ping(dht.PingRequest) returns (dht.PingResponse);
     */
    ping(request: PingRequest, context: T): Promise<PingResponse>;
    /**
     * @generated from protobuf rpc: leaveNotice(dht.LeaveNotice) returns (google.protobuf.Empty);
     */
    leaveNotice(request: LeaveNotice, context: T): Promise<Empty>;
}
/**
 * @generated from protobuf service dht.RoutingService
 */
export interface IRoutingService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: routeMessage(dht.RouteMessageWrapper) returns (dht.RouteMessageAck);
     */
    routeMessage(request: RouteMessageWrapper, context: T): Promise<RouteMessageAck>;
    /**
     * @generated from protobuf rpc: forwardMessage(dht.RouteMessageWrapper) returns (dht.RouteMessageAck);
     */
    forwardMessage(request: RouteMessageWrapper, context: T): Promise<RouteMessageAck>;
    /**
     * @generated from protobuf rpc: findRecursively(dht.RouteMessageWrapper) returns (dht.RouteMessageAck);
     */
    findRecursively(request: RouteMessageWrapper, context: T): Promise<RouteMessageAck>;
}
/**
 * @generated from protobuf service dht.StoreService
 */
export interface IStoreService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: storeData(dht.StoreDataRequest) returns (dht.StoreDataResponse);
     */
    storeData(request: StoreDataRequest, context: T): Promise<StoreDataResponse>;
}
/**
 * @generated from protobuf service dht.RecursiveFindSessionService
 */
export interface IRecursiveFindSessionService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: reportRecursiveFindResult(dht.RecursiveFindReport) returns (google.protobuf.Empty);
     */
    reportRecursiveFindResult(request: RecursiveFindReport, context: T): Promise<Empty>;
}
/**
 * @generated from protobuf service dht.WebSocketConnectorService
 */
export interface IWebSocketConnectorService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: requestConnection(dht.WebSocketConnectionRequest) returns (dht.WebSocketConnectionResponse);
     */
    requestConnection(request: WebSocketConnectionRequest, context: T): Promise<WebSocketConnectionResponse>;
}
/**
 * @generated from protobuf service dht.WebRtcConnectorService
 */
export interface IWebRtcConnectorService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: requestConnection(dht.WebRtcConnectionRequest) returns (google.protobuf.Empty);
     */
    requestConnection(request: WebRtcConnectionRequest, context: T): Promise<Empty>;
    /**
     * @generated from protobuf rpc: rtcOffer(dht.RtcOffer) returns (google.protobuf.Empty);
     */
    rtcOffer(request: RtcOffer, context: T): Promise<Empty>;
    /**
     * @generated from protobuf rpc: rtcAnswer(dht.RtcAnswer) returns (google.protobuf.Empty);
     */
    rtcAnswer(request: RtcAnswer, context: T): Promise<Empty>;
    /**
     * @generated from protobuf rpc: iceCandidate(dht.IceCandidate) returns (google.protobuf.Empty);
     */
    iceCandidate(request: IceCandidate, context: T): Promise<Empty>;
}
/**
 * @generated from protobuf service dht.ConnectionLocker
 */
export interface IConnectionLocker<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: lockRequest(dht.LockRequest) returns (dht.LockResponse);
     */
    lockRequest(request: LockRequest, context: T): Promise<LockResponse>;
    /**
     * @generated from protobuf rpc: unlockRequest(dht.UnlockRequest) returns (google.protobuf.Empty);
     */
    unlockRequest(request: UnlockRequest, context: T): Promise<Empty>;
    /**
     * @generated from protobuf rpc: gracefulDisconnect(dht.DisconnectNotice) returns (google.protobuf.Empty);
     */
    gracefulDisconnect(request: DisconnectNotice, context: T): Promise<Empty>;
}
