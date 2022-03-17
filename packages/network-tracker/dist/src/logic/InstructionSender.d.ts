import { StreamPartID } from 'streamr-client-protocol';
import { NodeId, Metrics } from 'streamr-network';
import { TopologyStabilizationOptions } from './Tracker';
export interface Instruction {
    nodeId: NodeId;
    streamPartId: StreamPartID;
    newNeighbors: NodeId[];
    counterValue: number;
}
export declare type SendInstructionFn = (receiverNodeId: NodeId, streamPartId: StreamPartID, nodeIds: NodeId[], counter: number) => Promise<void>;
export declare class InstructionSender {
    private readonly streamPartBuffers;
    private readonly options;
    private readonly sendInstruction;
    private readonly metrics;
    constructor(options: TopologyStabilizationOptions | undefined, sendInstruction: SendInstructionFn, metrics: Metrics);
    addInstruction(instruction: Instruction): void;
    stop(): void;
    private getOrCreateBuffer;
    private sendInstructions;
}
