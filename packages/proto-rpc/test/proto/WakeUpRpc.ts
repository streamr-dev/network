// @generated by protobuf-ts 2.9.4 with parameter server_generic,generate_dependencies
// @generated from protobuf file "WakeUpRpc.proto" (syntax proto3)
// tslint:disable
import { Empty } from "./google/protobuf/empty";
import { ServiceType } from "@protobuf-ts/runtime-rpc";
import { MessageType } from "@protobuf-ts/runtime";
/**
 * @generated from protobuf message WakeUpRequest
 */
export interface WakeUpRequest {
    /**
     * @generated from protobuf field: string reason = 1;
     */
    reason: string;
}
// @generated message type with reflection information, may provide speed optimized methods
class WakeUpRequest$Type extends MessageType<WakeUpRequest> {
    constructor() {
        super("WakeUpRequest", [
            { no: 1, name: "reason", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message WakeUpRequest
 */
export const WakeUpRequest = new WakeUpRequest$Type();
/**
 * @generated ServiceType for protobuf service WakeUpRpcService
 */
export const WakeUpRpcService = new ServiceType("WakeUpRpcService", [
    { name: "wakeUp", options: {}, I: WakeUpRequest, O: Empty }
]);
