// @generated by protobuf-ts 2.9.4 with parameter server_generic,generate_dependencies,long_type_number
// @generated from protobuf file "packages/sdk/protos/SdkRpc.proto" (syntax proto3)
// tslint:disable
import { OperatorDiscoveryResponse } from "./SdkRpc";
import { OperatorDiscoveryRequest } from "./SdkRpc";
import { ServerCallContext } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service OperatorDiscovery
 */
export interface IOperatorDiscovery<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: discoverOperators(OperatorDiscoveryRequest) returns (OperatorDiscoveryResponse);
     */
    discoverOperators(request: OperatorDiscoveryRequest, context: T): Promise<OperatorDiscoveryResponse>;
}
