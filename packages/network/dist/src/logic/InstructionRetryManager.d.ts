import { StreamPartID, InstructionMessage } from "@streamr/protocol";
import { TrackerId } from '../identifiers';
type HandleFn = (instructionMessage: InstructionMessage, trackerId: TrackerId, reattempt: boolean) => Promise<void>;
export declare class InstructionRetryManager {
    private readonly handleFn;
    private readonly intervalInMs;
    private readonly statusSendCounterLimit;
    private instructionRetryIntervals;
    private stopped;
    constructor(handleFn: HandleFn, intervalInMs: number);
    add(instructionMessage: InstructionMessage, trackerId: TrackerId): void;
    retryFunction(instructionMessage: InstructionMessage, trackerId: TrackerId): Promise<void>;
    removeStreamPart(streamPartId: StreamPartID): void;
    stop(): void;
}
export {};
