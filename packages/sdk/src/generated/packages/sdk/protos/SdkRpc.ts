// @generated by protobuf-ts 2.9.4 with parameter server_generic,generate_dependencies,long_type_number
// @generated from protobuf file "packages/sdk/protos/SdkRpc.proto" (syntax proto3)
// tslint:disable
import { ServiceType } from "@protobuf-ts/runtime-rpc";
import { MessageType } from "@protobuf-ts/runtime";
import { PeerDescriptor } from "../../dht/protos/PeerDescriptor";
/**
 * @generated from protobuf message OperatorDiscoveryRequest
 */
export interface OperatorDiscoveryRequest {
    /**
     * @generated from protobuf field: string streamPartId = 1;
     */
    streamPartId: string;
}
/**
 * @generated from protobuf message OperatorDiscoveryResponse
 */
export interface OperatorDiscoveryResponse {
    /**
     * @generated from protobuf field: repeated peerDescriptor.PeerDescriptor operators = 1;
     */
    operators: PeerDescriptor[];
}
// @generated message type with reflection information, may provide speed optimized methods
class OperatorDiscoveryRequest$Type extends MessageType<OperatorDiscoveryRequest> {
    constructor() {
        super("OperatorDiscoveryRequest", [
            { no: 1, name: "streamPartId", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message OperatorDiscoveryRequest
 */
export const OperatorDiscoveryRequest = new OperatorDiscoveryRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class OperatorDiscoveryResponse$Type extends MessageType<OperatorDiscoveryResponse> {
    constructor() {
        super("OperatorDiscoveryResponse", [
            { no: 1, name: "operators", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message OperatorDiscoveryResponse
 */
export const OperatorDiscoveryResponse = new OperatorDiscoveryResponse$Type();
/**
 * @generated ServiceType for protobuf service OperatorDiscovery
 */
export const OperatorDiscovery = new ServiceType("OperatorDiscovery", [
    { name: "discoverOperators", options: {}, I: OperatorDiscoveryRequest, O: OperatorDiscoveryResponse }
]);
