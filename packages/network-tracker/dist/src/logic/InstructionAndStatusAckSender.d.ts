import { StreamPartID } from '@streamr/protocol';
import { NodeId } from '@streamr/network-node';
import { MetricsContext } from '@streamr/utils';
import { TopologyStabilizationOptions } from './Tracker';
export interface Instruction {
    nodeId: NodeId;
    streamPartId: StreamPartID;
    newNeighbors: NodeId[];
    counterValue: number;
}
export interface StatusAck {
    nodeId: NodeId;
    streamPartId: StreamPartID;
}
export type SendInstructionFn = (receiverNodeId: NodeId, streamPartId: StreamPartID, nodeIds: NodeId[], counter: number) => Promise<void>;
export type SendStatusAckFn = (receiverNodeId: NodeId, streamPartId: StreamPartID) => Promise<void>;
export declare class InstructionAndStatusAckSender {
    private readonly streamPartBuffers;
    private readonly options;
    private readonly sendInstruction;
    private readonly sendStatusAck;
    private readonly metrics;
    constructor(options: TopologyStabilizationOptions | undefined, sendInstruction: SendInstructionFn, sendStatusAck: SendStatusAckFn, metricsContext: MetricsContext);
    addInstruction(instruction: Instruction): void;
    addStatusAck(statusAck: StatusAck): void;
    stop(): void;
    private getOrCreateBuffer;
    private sendInstructions;
}
