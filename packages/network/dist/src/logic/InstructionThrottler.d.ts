import { InstructionMessage, StreamPartID } from '@streamr/protocol';
import { TrackerId } from '../identifiers';
type HandleFn = (instructionMessage: InstructionMessage, trackerId: TrackerId) => Promise<void>;
/**
 * InstructionThrottler makes sure that
 *  1. no more than one instruction is handled at a time
 *  2. any new instructions arriving while an instruction is being handled are queued in a
 *     way where only the most latest instruction per stream part is kept in queue.
 */
export declare class InstructionThrottler {
    private readonly handleFn;
    private queue;
    private instructionCounter;
    private ongoingPromises;
    private stopped;
    constructor(handleFn: HandleFn);
    add(instructionMessage: InstructionMessage, trackerId: TrackerId): void;
    removeStreamPart(streamPartId: StreamPartID): void;
    isIdle(): boolean;
    stop(): void;
    private invokeHandleFnWithLock;
}
export {};
