// @generated by protobuf-ts 2.9.3 with parameter server_generic,generate_dependencies,long_type_number
// @generated from protobuf file "packages/trackerless-network/protos/NetworkRpc.proto" (syntax proto3)
// tslint:disable
import { TemporaryConnectionResponse } from "./NetworkRpc";
import { TemporaryConnectionRequest } from "./NetworkRpc";
import { NeighborUpdate } from "./NetworkRpc";
import { InterleaveResponse } from "./NetworkRpc";
import { InterleaveRequest } from "./NetworkRpc";
import { StreamPartHandshakeResponse } from "./NetworkRpc";
import { StreamPartHandshakeRequest } from "./NetworkRpc";
import { ProxyConnectionResponse } from "./NetworkRpc";
import { ProxyConnectionRequest } from "./NetworkRpc";
import { LeaveStreamPartNotice } from "./NetworkRpc";
import { Empty } from "../../../google/protobuf/empty";
import { StreamMessage } from "./NetworkRpc";
import { ServerCallContext } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service DeliveryRpc
 */
export interface IDeliveryRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: sendStreamMessage(StreamMessage) returns (google.protobuf.Empty);
     */
    sendStreamMessage(request: StreamMessage, context: T): Promise<Empty>;
    /**
     * @generated from protobuf rpc: leaveStreamPartNotice(LeaveStreamPartNotice) returns (google.protobuf.Empty);
     */
    leaveStreamPartNotice(request: LeaveStreamPartNotice, context: T): Promise<Empty>;
}
/**
 * @generated from protobuf service ProxyConnectionRpc
 */
export interface IProxyConnectionRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: requestConnection(ProxyConnectionRequest) returns (ProxyConnectionResponse);
     */
    requestConnection(request: ProxyConnectionRequest, context: T): Promise<ProxyConnectionResponse>;
}
/**
 * @generated from protobuf service HandshakeRpc
 */
export interface IHandshakeRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: handshake(StreamPartHandshakeRequest) returns (StreamPartHandshakeResponse);
     */
    handshake(request: StreamPartHandshakeRequest, context: T): Promise<StreamPartHandshakeResponse>;
    /**
     * @generated from protobuf rpc: interleaveRequest(InterleaveRequest) returns (InterleaveResponse);
     */
    interleaveRequest(request: InterleaveRequest, context: T): Promise<InterleaveResponse>;
}
/**
 * @generated from protobuf service NeighborUpdateRpc
 */
export interface INeighborUpdateRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: neighborUpdate(NeighborUpdate) returns (NeighborUpdate);
     */
    neighborUpdate(request: NeighborUpdate, context: T): Promise<NeighborUpdate>;
}
/**
 * @generated from protobuf service TemporaryConnectionRpc
 */
export interface ITemporaryConnectionRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: openConnection(TemporaryConnectionRequest) returns (TemporaryConnectionResponse);
     */
    openConnection(request: TemporaryConnectionRequest, context: T): Promise<TemporaryConnectionResponse>;
}
