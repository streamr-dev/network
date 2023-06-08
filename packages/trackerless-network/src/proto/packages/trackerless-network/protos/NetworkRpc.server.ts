// @generated by protobuf-ts 2.8.2 with parameter server_generic,generate_dependencies,long_type_number
// @generated from protobuf file "packages/trackerless-network/protos/NetworkRpc.proto" (syntax proto3)
// tslint:disable
import { NeighborUpdate } from "./NetworkRpc";
import { InterleaveNotice } from "./NetworkRpc";
import { StreamHandshakeResponse } from "./NetworkRpc";
import { StreamHandshakeRequest } from "./NetworkRpc";
import { ProxyConnectionResponse } from "./NetworkRpc";
import { ProxyConnectionRequest } from "./NetworkRpc";
import { LeaveStreamNotice } from "./NetworkRpc";
import { Empty } from "../../../google/protobuf/empty";
import { StreamMessage } from "./NetworkRpc";
import { ServerCallContext } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service NetworkRpc
 */
export interface INetworkRpc<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: sendData(StreamMessage) returns (google.protobuf.Empty);
     */
    sendData(request: StreamMessage, context: T): Promise<Empty>;
    /**
     * @generated from protobuf rpc: leaveStreamNotice(LeaveStreamNotice) returns (google.protobuf.Empty);
     */
    leaveStreamNotice(request: LeaveStreamNotice, context: T): Promise<Empty>;
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
     * @generated from protobuf rpc: handshake(StreamHandshakeRequest) returns (StreamHandshakeResponse);
     */
    handshake(request: StreamHandshakeRequest, context: T): Promise<StreamHandshakeResponse>;
    /**
     * @generated from protobuf rpc: interleaveNotice(InterleaveNotice) returns (google.protobuf.Empty);
     */
    interleaveNotice(request: InterleaveNotice, context: T): Promise<Empty>;
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
