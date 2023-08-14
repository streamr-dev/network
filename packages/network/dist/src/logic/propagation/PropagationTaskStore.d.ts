import { MessageID, StreamPartID, StreamMessage } from '@streamr/protocol';
import { NodeId } from '../../identifiers';
export interface PropagationTask {
    message: StreamMessage;
    source: NodeId | null;
    handledNeighbors: Set<NodeId>;
}
/**
 * Keeps track of propagation tasks for the needs of message propagation logic.
 *
 * Properties:
 * - Allows fetching propagation tasks by StreamPartID
 * - Upper bound on number of tasks stored, replacement policy if FIFO
 * - Items have a TTL, after which they are considered stale and not returned when querying
**/
export declare class PropagationTaskStore {
    private readonly streamPartLookup;
    private readonly tasks;
    constructor(ttlInMs: number, maxTasks: number);
    add(task: PropagationTask): void;
    delete(messageId: MessageID): void;
    get(streamPartId: StreamPartID): Array<PropagationTask>;
    size(): number;
}
