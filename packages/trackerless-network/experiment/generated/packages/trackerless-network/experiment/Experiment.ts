// @generated by protobuf-ts 2.9.4 with parameter server_generic,generate_dependencies,long_type_number
// @generated from protobuf file "packages/trackerless-network/experiment/Experiment.proto" (syntax proto3)
// tslint:disable
import { ServiceType } from "@protobuf-ts/runtime-rpc";
import { MessageType } from "@protobuf-ts/runtime";
import { PeerDescriptor } from "../../dht/protos/PeerDescriptor";
/**
 * @generated from protobuf message ExperimentServerMessage
 */
export interface ExperimentServerMessage {
    /**
     * @generated from protobuf oneof: instruction
     */
    instruction: {
        oneofKind: "start";
        /**
         * @generated from protobuf field: Start start = 1;
         */
        start: Start;
    } | {
        oneofKind: "joinExperiment";
        /**
         * @generated from protobuf field: JoinExperiment joinExperiment = 2;
         */
        joinExperiment: JoinExperiment;
    } | {
        oneofKind: "joinStreamPart";
        /**
         * @generated from protobuf field: JoinStreamPart joinStreamPart = 3;
         */
        joinStreamPart: JoinStreamPart;
    } | {
        oneofKind: "publishMessage";
        /**
         * @generated from protobuf field: PublishMessage publishMessage = 4;
         */
        publishMessage: PublishMessage;
    } | {
        oneofKind: "getPropagationResults";
        /**
         * @generated from protobuf field: GetPropagationResults getPropagationResults = 5;
         */
        getPropagationResults: GetPropagationResults;
    } | {
        oneofKind: "routingExperiment";
        /**
         * @generated from protobuf field: RoutingExperiment routingExperiment = 6;
         */
        routingExperiment: RoutingExperiment;
    } | {
        oneofKind: "publishOnInterval";
        /**
         * @generated from protobuf field: PublishOnInterval publishOnInterval = 7;
         */
        publishOnInterval: PublishOnInterval;
    } | {
        oneofKind: "measureTimeToData";
        /**
         * @generated from protobuf field: MeasureTimeToData MeasureTimeToData = 8 [json_name = "MeasureTimeToData"];
         */
        measureTimeToData: MeasureTimeToData;
    } | {
        oneofKind: undefined;
    };
}
/**
 * @generated from protobuf message ExperimentClientMessage
 */
export interface ExperimentClientMessage {
    /**
     * @generated from protobuf field: string id = 1;
     */
    id: string;
    /**
     * @generated from protobuf oneof: payload
     */
    payload: {
        oneofKind: "hello";
        /**
         * @generated from protobuf field: Hello hello = 2;
         */
        hello: Hello;
    } | {
        oneofKind: "started";
        /**
         * @generated from protobuf field: Started started = 3;
         */
        started: Started;
    } | {
        oneofKind: "experimentResults";
        /**
         * @generated from protobuf field: ExperimentResults experimentResults = 4;
         */
        experimentResults: ExperimentResults;
    } | {
        oneofKind: "instructionCompleted";
        /**
         * @generated from protobuf field: InstructionCompleted instructionCompleted = 5;
         */
        instructionCompleted: InstructionCompleted;
    } | {
        oneofKind: "propagationResults";
        /**
         * @generated from protobuf field: PropagationResults propagationResults = 6;
         */
        propagationResults: PropagationResults;
    } | {
        oneofKind: undefined;
    };
}
/**
 * @generated from protobuf message Hello
 */
export interface Hello {
}
/**
 * @generated from protobuf message Start
 */
export interface Start {
    /**
     * @generated from protobuf field: repeated peerDescriptor.PeerDescriptor entryPoints = 1;
     */
    entryPoints: PeerDescriptor[];
    /**
     * @generated from protobuf field: bool asEntryPoint = 2;
     */
    asEntryPoint: boolean;
    /**
     * @generated from protobuf field: bool join = 3;
     */
    join: boolean;
    /**
     * @generated from protobuf field: optional string nodeId = 4;
     */
    nodeId?: string;
    /**
     * @generated from protobuf field: bool storeRoutingPaths = 5;
     */
    storeRoutingPaths: boolean;
}
/**
 * @generated from protobuf message Started
 */
export interface Started {
    /**
     * @generated from protobuf field: peerDescriptor.PeerDescriptor peerDescriptor = 1;
     */
    peerDescriptor?: PeerDescriptor;
    /**
     * @generated from protobuf field: int32 timeToJoin = 2;
     */
    timeToJoin: number;
}
/**
 * @generated from protobuf message JoinExperiment
 */
export interface JoinExperiment {
    /**
     * @generated from protobuf field: repeated peerDescriptor.PeerDescriptor entryPoints = 1;
     */
    entryPoints: PeerDescriptor[];
}
/**
 * @generated from protobuf message RoutingExperiment
 */
export interface RoutingExperiment {
    /**
     * @generated from protobuf field: repeated peerDescriptor.PeerDescriptor routingTargets = 1;
     */
    routingTargets: PeerDescriptor[];
}
/**
 * @generated from protobuf message ExperimentResults
 */
export interface ExperimentResults {
    /**
     * @generated from protobuf field: string results = 1;
     */
    results: string;
}
/**
 * @generated from protobuf message JoinStreamPart
 */
export interface JoinStreamPart {
    /**
     * @generated from protobuf field: string streamPartId = 1;
     */
    streamPartId: string;
    /**
     * @generated from protobuf field: int32 neighborCount = 2;
     */
    neighborCount: number;
}
/**
 * @generated from protobuf message PublishMessage
 */
export interface PublishMessage {
    /**
     * @generated from protobuf field: string streamPartId = 1;
     */
    streamPartId: string;
}
/**
 * @generated from protobuf message GetRoutingPath
 */
export interface GetRoutingPath {
    /**
     * @generated from protobuf field: string id = 1;
     */
    id: string;
    /**
     * @generated from protobuf field: int64 sendTime = 2;
     */
    sendTime: number;
}
/**
 * @generated from protobuf message RoutingPath
 */
export interface RoutingPath {
    /**
     * @generated from protobuf field: repeated peerDescriptor.PeerDescriptor path = 1;
     */
    path: PeerDescriptor[];
}
/**
 * @generated from protobuf message GetPropagationResults
 */
export interface GetPropagationResults {
    /**
     * @generated from protobuf field: string streamPartId = 1;
     */
    streamPartId: string;
}
/**
 * @generated from protobuf message PropagationResults
 */
export interface PropagationResults {
    /**
     * @generated from protobuf field: repeated string results = 1;
     */
    results: string[];
}
/**
 * @generated from protobuf message InstructionCompleted
 */
export interface InstructionCompleted {
}
/**
 * @generated from protobuf message PublishOnInterval
 */
export interface PublishOnInterval {
    /**
     * @generated from protobuf field: string streamPartId = 1;
     */
    streamPartId: string;
    /**
     * @generated from protobuf field: int32 interval = 2;
     */
    interval: number;
}
/**
 * @generated from protobuf message MeasureTimeToData
 */
export interface MeasureTimeToData {
    /**
     * @generated from protobuf field: string streamPartId = 1;
     */
    streamPartId: string;
}
// @generated message type with reflection information, may provide speed optimized methods
class ExperimentServerMessage$Type extends MessageType<ExperimentServerMessage> {
    constructor() {
        super("ExperimentServerMessage", [
            { no: 1, name: "start", kind: "message", oneof: "instruction", T: () => Start },
            { no: 2, name: "joinExperiment", kind: "message", oneof: "instruction", T: () => JoinExperiment },
            { no: 3, name: "joinStreamPart", kind: "message", oneof: "instruction", T: () => JoinStreamPart },
            { no: 4, name: "publishMessage", kind: "message", oneof: "instruction", T: () => PublishMessage },
            { no: 5, name: "getPropagationResults", kind: "message", oneof: "instruction", T: () => GetPropagationResults },
            { no: 6, name: "routingExperiment", kind: "message", oneof: "instruction", T: () => RoutingExperiment },
            { no: 7, name: "publishOnInterval", kind: "message", oneof: "instruction", T: () => PublishOnInterval },
            { no: 8, name: "MeasureTimeToData", kind: "message", jsonName: "MeasureTimeToData", oneof: "instruction", T: () => MeasureTimeToData }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ExperimentServerMessage
 */
export const ExperimentServerMessage = new ExperimentServerMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ExperimentClientMessage$Type extends MessageType<ExperimentClientMessage> {
    constructor() {
        super("ExperimentClientMessage", [
            { no: 1, name: "id", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "hello", kind: "message", oneof: "payload", T: () => Hello },
            { no: 3, name: "started", kind: "message", oneof: "payload", T: () => Started },
            { no: 4, name: "experimentResults", kind: "message", oneof: "payload", T: () => ExperimentResults },
            { no: 5, name: "instructionCompleted", kind: "message", oneof: "payload", T: () => InstructionCompleted },
            { no: 6, name: "propagationResults", kind: "message", oneof: "payload", T: () => PropagationResults }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ExperimentClientMessage
 */
export const ExperimentClientMessage = new ExperimentClientMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class Hello$Type extends MessageType<Hello> {
    constructor() {
        super("Hello", []);
    }
}
/**
 * @generated MessageType for protobuf message Hello
 */
export const Hello = new Hello$Type();
// @generated message type with reflection information, may provide speed optimized methods
class Start$Type extends MessageType<Start> {
    constructor() {
        super("Start", [
            { no: 1, name: "entryPoints", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor },
            { no: 2, name: "asEntryPoint", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
            { no: 3, name: "join", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
            { no: 4, name: "nodeId", kind: "scalar", opt: true, T: 9 /*ScalarType.STRING*/ },
            { no: 5, name: "storeRoutingPaths", kind: "scalar", T: 8 /*ScalarType.BOOL*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message Start
 */
export const Start = new Start$Type();
// @generated message type with reflection information, may provide speed optimized methods
class Started$Type extends MessageType<Started> {
    constructor() {
        super("Started", [
            { no: 1, name: "peerDescriptor", kind: "message", T: () => PeerDescriptor },
            { no: 2, name: "timeToJoin", kind: "scalar", T: 5 /*ScalarType.INT32*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message Started
 */
export const Started = new Started$Type();
// @generated message type with reflection information, may provide speed optimized methods
class JoinExperiment$Type extends MessageType<JoinExperiment> {
    constructor() {
        super("JoinExperiment", [
            { no: 1, name: "entryPoints", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message JoinExperiment
 */
export const JoinExperiment = new JoinExperiment$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RoutingExperiment$Type extends MessageType<RoutingExperiment> {
    constructor() {
        super("RoutingExperiment", [
            { no: 1, name: "routingTargets", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message RoutingExperiment
 */
export const RoutingExperiment = new RoutingExperiment$Type();
// @generated message type with reflection information, may provide speed optimized methods
class ExperimentResults$Type extends MessageType<ExperimentResults> {
    constructor() {
        super("ExperimentResults", [
            { no: 1, name: "results", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message ExperimentResults
 */
export const ExperimentResults = new ExperimentResults$Type();
// @generated message type with reflection information, may provide speed optimized methods
class JoinStreamPart$Type extends MessageType<JoinStreamPart> {
    constructor() {
        super("JoinStreamPart", [
            { no: 1, name: "streamPartId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "neighborCount", kind: "scalar", T: 5 /*ScalarType.INT32*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message JoinStreamPart
 */
export const JoinStreamPart = new JoinStreamPart$Type();
// @generated message type with reflection information, may provide speed optimized methods
class PublishMessage$Type extends MessageType<PublishMessage> {
    constructor() {
        super("PublishMessage", [
            { no: 1, name: "streamPartId", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message PublishMessage
 */
export const PublishMessage = new PublishMessage$Type();
// @generated message type with reflection information, may provide speed optimized methods
class GetRoutingPath$Type extends MessageType<GetRoutingPath> {
    constructor() {
        super("GetRoutingPath", [
            { no: 1, name: "id", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "sendTime", kind: "scalar", T: 3 /*ScalarType.INT64*/, L: 2 /*LongType.NUMBER*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message GetRoutingPath
 */
export const GetRoutingPath = new GetRoutingPath$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RoutingPath$Type extends MessageType<RoutingPath> {
    constructor() {
        super("RoutingPath", [
            { no: 1, name: "path", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PeerDescriptor }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message RoutingPath
 */
export const RoutingPath = new RoutingPath$Type();
// @generated message type with reflection information, may provide speed optimized methods
class GetPropagationResults$Type extends MessageType<GetPropagationResults> {
    constructor() {
        super("GetPropagationResults", [
            { no: 1, name: "streamPartId", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message GetPropagationResults
 */
export const GetPropagationResults = new GetPropagationResults$Type();
// @generated message type with reflection information, may provide speed optimized methods
class PropagationResults$Type extends MessageType<PropagationResults> {
    constructor() {
        super("PropagationResults", [
            { no: 1, name: "results", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message PropagationResults
 */
export const PropagationResults = new PropagationResults$Type();
// @generated message type with reflection information, may provide speed optimized methods
class InstructionCompleted$Type extends MessageType<InstructionCompleted> {
    constructor() {
        super("InstructionCompleted", []);
    }
}
/**
 * @generated MessageType for protobuf message InstructionCompleted
 */
export const InstructionCompleted = new InstructionCompleted$Type();
// @generated message type with reflection information, may provide speed optimized methods
class PublishOnInterval$Type extends MessageType<PublishOnInterval> {
    constructor() {
        super("PublishOnInterval", [
            { no: 1, name: "streamPartId", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "interval", kind: "scalar", T: 5 /*ScalarType.INT32*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message PublishOnInterval
 */
export const PublishOnInterval = new PublishOnInterval$Type();
// @generated message type with reflection information, may provide speed optimized methods
class MeasureTimeToData$Type extends MessageType<MeasureTimeToData> {
    constructor() {
        super("MeasureTimeToData", [
            { no: 1, name: "streamPartId", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
}
/**
 * @generated MessageType for protobuf message MeasureTimeToData
 */
export const MeasureTimeToData = new MeasureTimeToData$Type();
/**
 * @generated ServiceType for protobuf service RoutingExperimentRpc
 */
export const RoutingExperimentRpc = new ServiceType("RoutingExperimentRpc", [
    { name: "getRoutingPath", options: {}, I: GetRoutingPath, O: RoutingPath }
]);
