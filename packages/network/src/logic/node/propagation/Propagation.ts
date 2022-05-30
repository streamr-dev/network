import { StreamPartID, StreamMessage } from 'streamr-client-protocol'
import { NodeId } from '../Node'
import { PropagationTask, PropagationTaskStore } from './PropagationTaskStore'

type GetNeighborsFn = (streamPartId: StreamPartID) => ReadonlyArray<NodeId>

type SendToNeighborFn = (neighborId: NodeId, msg: StreamMessage) => Promise<void>

type ConstructorOptions = {
    getNeighbors: GetNeighborsFn
    sendToNeighbor: SendToNeighborFn
    minPropagationTargets: number
    ttl?: number
    maxMessages?: number
}

const DEFAULT_MAX_MESSAGES = 10000
const DEFAULT_TTL = 30 * 1000

/**
 * Message propagation logic of a node. Given a message, this class will actively attempt to propagate it to
 * `minPropagationTargets` neighbors until success or TTL expiration.
 *
 * Setting `minPropagationTargets = 0` effectively disables any propagation reattempts. A message will then
 * only be propagated exactly once, to neighbors that are present at that moment, in a fire-and-forget manner.
 */

export class Propagation {
    private readonly getNeighbors: GetNeighborsFn
    private readonly sendToNeighbor: SendToNeighborFn
    private readonly minPropagationTargets: number
    private readonly activeTaskStore: PropagationTaskStore

    constructor({
        getNeighbors,
        sendToNeighbor,
        minPropagationTargets,
        ttl = DEFAULT_TTL,
        maxMessages = DEFAULT_MAX_MESSAGES
    }: ConstructorOptions) {
        this.getNeighbors = getNeighbors
        this.sendToNeighbor = sendToNeighbor
        this.minPropagationTargets = minPropagationTargets
        this.activeTaskStore = new PropagationTaskStore(ttl, maxMessages)
    }

    /**
     * Node should invoke this when it learns about a new message
     */
    feedUnseenMessage(message: StreamMessage, source: NodeId | null): void {
        const task = {
            message,
            source,
            handledNeighbors: new Set<NodeId>()
        }
        this.activeTaskStore.add(task)
        const neighbors = this.getNeighbors(message.getStreamPartID())
        for (const neighborId of neighbors) {
            this.sendAndAwaitThenMark(task, neighborId)
        }
    }

    /**
     * Node should invoke this when it learns about a new node stream assignment
     */
    onNeighborJoined(neighborId: NodeId, streamPartId: StreamPartID): void {
        const tasksOfStream = this.activeTaskStore.get(streamPartId)
        for (const task of tasksOfStream) {
            this.sendAndAwaitThenMark(task, neighborId)
        }
    }

    private sendAndAwaitThenMark({ message, source, handledNeighbors }: PropagationTask, neighborId: NodeId): void {
        if (!handledNeighbors.has(neighborId) && neighborId !== source) {
            (async () => {
                try {
                    await this.sendToNeighbor(neighborId, message)
                } catch {
                    return
                }
                // Side-note: due to asynchronicity, the task being modified at this point could already be stale and
                // deleted from `activeTaskStore`. However, as modifying it or re-deleting it is pretty much
                // inconsequential at this point, leaving the logic as is.
                handledNeighbors.add(neighborId)
                if (handledNeighbors.size >= this.minPropagationTargets) {
                    this.activeTaskStore.delete(message.messageId)
                }
            })()
        }
    }
}
