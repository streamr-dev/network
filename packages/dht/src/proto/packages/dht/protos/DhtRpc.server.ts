// @generated by protobuf-ts 2.9.4 with parameter server_generic,generate_dependencies,long_type_number
// @generated from protobuf file "packages/dht/protos/DhtRpc.proto" (package "dht", syntax proto3)
// tslint:disable
import { ExternalStoreDataResponse } from "./DhtRpc";
import { ExternalStoreDataRequest } from "./DhtRpc";
import { ExternalFetchDataResponse } from "./DhtRpc";
import { ExternalFetchDataRequest } from "./DhtRpc";
import { SetPrivateRequest } from "./DhtRpc";
import { DisconnectNotice } from "./DhtRpc";
import { UnlockRequest } from "./DhtRpc";
import { LockResponse } from "./DhtRpc";
import { LockRequest } from "./DhtRpc";
import { IceCandidate } from "./DhtRpc";
import { RtcAnswer } from "./DhtRpc";
import { RtcOffer } from "./DhtRpc";
import { WebrtcConnectionRequest } from "./DhtRpc";
import { WebsocketConnectionRequest } from "./DhtRpc";
import { RecursiveOperationResponse } from "./DhtRpc";
import { ReplicateDataRequest } from "./DhtRpc";
import { StoreDataResponse } from "./DhtRpc";
import { StoreDataRequest } from "./DhtRpc";
import { RouteMessageAck } from "./DhtRpc";
import { RouteMessageWrapper } from "./DhtRpc";
import { Empty } from "../../../google/protobuf/empty";
import { LeaveNotice } from "./DhtRpc";
import { PingResponse } from "./DhtRpc";
import { PingRequest } from "./DhtRpc";
import { ClosestRingPeersResponse } from "./DhtRpc";
import { ClosestRingPeersRequest } from "./DhtRpc";
import { ClosestPeersResponse } from "./DhtRpc";
import { ClosestPeersRequest } from "./DhtRpc";
import { ServerCallContext } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service dht.DhtNodeRpc
 */
export interface IDhtNodeRpc<T = ServerCallContext> {
    /**
     * TODO rename to getClosestNeighbors (breaking change)
     *
     * @generated from protobuf rpc: getClosestPeers(dht.ClosestPeersRequest) returns (dht.ClosestPeersResponse);
     */
    getClosestPeers(request: ClosestPeersRequest, context: T): Promise<ClosestPeersResponse>;
    /**
     * TODO rename to getClosestRingContacts (breaking change)
     *
     * @generated from protobuf rpc: getClosestRingPeers(dht.ClosestRingPeersRequest) returns (dht.ClosestRingPeersResponse);
     */
    getClosestRingPeers(request: ClosestRingPeersRequest, context: T): Promise<ClosestRingPeersResponse>;
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
 * @generated from protobuf service dht.RouterRpc
 */
export interface IRouterRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: routeMessage(dht.RouteMessageWrapper) returns (dht.RouteMessageAck);
     */
    routeMessage(request: RouteMessageWrapper, context: T): Promise<RouteMessageAck>;
    /**
     * @generated from protobuf rpc: forwardMessage(dht.RouteMessageWrapper) returns (dht.RouteMessageAck);
     */
    forwardMessage(request: RouteMessageWrapper, context: T): Promise<RouteMessageAck>;
}
/**
 * @generated from protobuf service dht.RecursiveOperationRpc
 */
export interface IRecursiveOperationRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: routeRequest(dht.RouteMessageWrapper) returns (dht.RouteMessageAck);
     */
    routeRequest(request: RouteMessageWrapper, context: T): Promise<RouteMessageAck>;
}
/**
 * @generated from protobuf service dht.StoreRpc
 */
export interface IStoreRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: storeData(dht.StoreDataRequest) returns (dht.StoreDataResponse);
     */
    storeData(request: StoreDataRequest, context: T): Promise<StoreDataResponse>;
    /**
     * @generated from protobuf rpc: replicateData(dht.ReplicateDataRequest) returns (google.protobuf.Empty);
     */
    replicateData(request: ReplicateDataRequest, context: T): Promise<Empty>;
}
/**
 * @generated from protobuf service dht.RecursiveOperationSessionRpc
 */
export interface IRecursiveOperationSessionRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: sendResponse(dht.RecursiveOperationResponse) returns (google.protobuf.Empty);
     */
    sendResponse(request: RecursiveOperationResponse, context: T): Promise<Empty>;
}
/**
 * @generated from protobuf service dht.WebsocketClientConnectorRpc
 */
export interface IWebsocketClientConnectorRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: requestConnection(dht.WebsocketConnectionRequest) returns (google.protobuf.Empty);
     */
    requestConnection(request: WebsocketConnectionRequest, context: T): Promise<Empty>;
}
/**
 * @generated from protobuf service dht.WebrtcConnectorRpc
 */
export interface IWebrtcConnectorRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: requestConnection(dht.WebrtcConnectionRequest) returns (google.protobuf.Empty);
     */
    requestConnection(request: WebrtcConnectionRequest, context: T): Promise<Empty>;
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
 * @generated from protobuf service dht.ConnectionLockRpc
 */
export interface IConnectionLockRpc<T = ServerCallContext> {
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
    /**
     * @generated from protobuf rpc: setPrivate(dht.SetPrivateRequest) returns (google.protobuf.Empty);
     */
    setPrivate(request: SetPrivateRequest, context: T): Promise<Empty>;
}
/**
 * @generated from protobuf service dht.ExternalApiRpc
 */
export interface IExternalApiRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: externalFetchData(dht.ExternalFetchDataRequest) returns (dht.ExternalFetchDataResponse);
     */
    externalFetchData(request: ExternalFetchDataRequest, context: T): Promise<ExternalFetchDataResponse>;
    /**
     * @generated from protobuf rpc: externalStoreData(dht.ExternalStoreDataRequest) returns (dht.ExternalStoreDataResponse);
     */
    externalStoreData(request: ExternalStoreDataRequest, context: T): Promise<ExternalStoreDataResponse>;
}
