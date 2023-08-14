import { StreamPartID, StreamMessage } from '@streamr/protocol';
import { NodeId } from '../../identifiers';
type SendToNeighborFn = (neighborId: NodeId, msg: StreamMessage) => Promise<void>;
interface ConstructorOptions {
    sendToNeighbor: SendToNeighborFn;
    minPropagationTargets: number;
    ttl?: number;
    maxMessages?: number;
}
/**
 * Message propagation logic of a node. Given a message, this class will actively attempt to propagate it to
 * `minPropagationTargets` neighbors until success or TTL expiration.
 *
 * Setting `minPropagationTargets = 0` effectively disables any propagation reattempts. A message will then
 * only be propagated exactly once, to neighbors that are present at that moment, in a fire-and-forget manner.
 */
export declare class Propagation {
    private readonly sendToNeighbor;
    private readonly minPropagationTargets;
    private readonly activeTaskStore;
    constructor({ sendToNeighbor, minPropagationTargets, ttl, maxMessages }: ConstructorOptions);
    /**
     * Node should invoke this when it learns about a new message
     */
    feedUnseenMessage(message: StreamMessage, targets: NodeId[], source: NodeId | null): void;
    /**
     * Node should invoke this when it learns about a new node stream assignment
     */
    onNeighborJoined(neighborId: NodeId, streamPartId: StreamPartID): void;
    numOfActivePropagationTasks(): number;
    private sendAndAwaitThenMark;
}
export {};
