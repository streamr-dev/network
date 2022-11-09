// @generated by protobuf-ts 2.8.1 with parameter server_generic,generate_dependencies
// @generated from protobuf file "WakeUpRpc.proto" (syntax proto3)
// tslint:disable
import { Empty } from "./google/protobuf/empty";
import { WakeUpRequest } from "./WakeUpRpc";
import { ServerCallContext } from "@protobuf-ts/runtime-rpc";
/**
 * @generated from protobuf service WakeUpRpcService
 */
export interface IWakeUpRpcService<T = ServerCallContext> {
    /**
     * @generated from protobuf rpc: wakeUp(WakeUpRequest) returns (google.protobuf.Empty);
     */
    wakeUp(request: WakeUpRequest, context: T): Promise<Empty>;
}
