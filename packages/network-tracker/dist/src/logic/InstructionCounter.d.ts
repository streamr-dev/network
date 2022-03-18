import { StreamPartID } from 'streamr-client-protocol';
import { Status, NodeId } from 'streamr-network';
export declare class InstructionCounter {
    private readonly counters;
    setOrIncrement(nodeId: NodeId, streamPartId: StreamPartID): number;
    isMostRecent(status: Status, source: NodeId): boolean;
    removeNodeFromStreamPart(nodeId: NodeId, streamPartId: StreamPartID): void;
    removeStreamPart(streamPartId: StreamPartID): void;
    private getAndSetIfNecessary;
}
