import { StreamPartID } from '@streamr/protocol';
import { Status, NodeId } from '@streamr/network-node';
export declare class InstructionCounter {
    private readonly counters;
    setOrIncrement(nodeId: NodeId, streamPartId: StreamPartID): number;
    isMostRecent(status: Status, source: NodeId): boolean;
    removeNodeFromStreamPart(nodeId: NodeId, streamPartId: StreamPartID): void;
    removeStreamPart(streamPartId: StreamPartID): void;
    private getAndSetIfNecessary;
}
