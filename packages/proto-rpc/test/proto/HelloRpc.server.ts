// @generated by protobuf-ts 2.8.1 with parameter server_generic,generate_dependencies
// @generated from protobuf file "HelloRpc.proto" (syntax proto3)
// tslint:disable
import { HelloResponse } from "./HelloRpc";
import { HelloRequest } from "./HelloRpc";
import { ServerCallContext } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service HelloRpcService
 */
export interface IHelloRpcService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: sayHello(HelloRequest) returns (HelloResponse);
     */
    sayHello(request: HelloRequest, context: T): Promise<HelloResponse>;
}
