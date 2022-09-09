// @generated by protobuf-ts 2.8.0 with parameter server_generic,generate_dependencies
// @generated from protobuf file "RoutedHelloRpc.proto" (syntax proto3)
// tslint:disable
import { ServiceType } from "@protobuf-ts/runtime-rpc";
import { MessageType } from "@protobuf-ts/runtime";
/**
 * @generated from protobuf message RoutedHelloRequest
 */
export interface RoutedHelloRequest {
    /**
     * @generated from protobuf field: string myName = 1;
     */
    myName: string;
}
/**
 * @generated from protobuf message RoutedHelloResponse
 */
export interface RoutedHelloResponse {
    /**
     * @generated from protobuf field: string greeting = 1;
     */
    greeting: string;
}
// @generated message type with reflection information, may provide speed optimized methods
class RoutedHelloRequest$Type extends MessageType<RoutedHelloRequest> {
    constructor() {
        super("RoutedHelloRequest", [
            { no: 1, name: "myName", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message RoutedHelloRequest
 */
export const RoutedHelloRequest = new RoutedHelloRequest$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RoutedHelloResponse$Type extends MessageType<RoutedHelloResponse> {
    constructor() {
        super("RoutedHelloResponse", [
            { no: 1, name: "greeting", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message RoutedHelloResponse
 */
export const RoutedHelloResponse = new RoutedHelloResponse$Type();
/**
 * @generated ServiceType for protobuf service RoutedHelloRpcService
 */
export const RoutedHelloRpcService = new ServiceType("RoutedHelloRpcService", [
    { name: "sayHello", options: {}, I: RoutedHelloRequest, O: RoutedHelloResponse }
]);
