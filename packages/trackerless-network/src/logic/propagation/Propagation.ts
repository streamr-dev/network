import { StreamMessage } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { PropagationTask, PropagationTaskStore } from './PropagationTaskStore'

type SendToNeighborFn = (neighborId: string, msg: StreamMessage) => Promise<void>

interface ConstructorOptions {
    sendToNeighbor: SendToNeighborFn
    minPropagationTargets: number
    randomGraphId: string
    ttl?: number
    maxMessages?: number
}

const DEFAULT_MAX_MESSAGES = 30
const DEFAULT_TTL = 30 * 1000

/**
 * Message propagation logic of a node. Given a message, this class will actively attempt to propagate it to
 * `minPropagationTargets` neighbors until success or TTL expiration.
 *
 * Setting `minPropagationTargets = 0` effectively disables any propagation reattempts. A message will then
 * only be propagated exactly once, to neighbors that are present at that moment, in a fire-and-forget manner.
 */

export class Propagation {
    private readonly sendToNeighbor: SendToNeighborFn
    private readonly minPropagationTargets: number
    private readonly activeTaskStore: PropagationTaskStore
    private readonly randomGraphId: string

    constructor({
                    sendToNeighbor,
                    minPropagationTargets,
                    randomGraphId,
                    ttl = DEFAULT_TTL,
                    maxMessages = DEFAULT_MAX_MESSAGES
                }: ConstructorOptions) {
        this.sendToNeighbor = sendToNeighbor
        this.randomGraphId = randomGraphId
        this.minPropagationTargets = minPropagationTargets
        this.activeTaskStore = new PropagationTaskStore(ttl, maxMessages)
    }

    /**
     * Node should invoke this when it learns about a new message
     */
    feedUnseenMessage(message: StreamMessage, targets: string[], source: string | null): void {
        const task = {
            message,
            source,
            handledNeighbors: new Set<string>()
        }
        this.activeTaskStore.add(task)
        for (const target of targets) {
            this.sendAndAwaitThenMark(task, target)
        }
    }

    /**
     * Node should invoke this when it learns about a new node stream assignment
     */
    onNeighborJoined(neighborId: string): void {
        const tasksOfStream = this.activeTaskStore.get()
        for (const task of tasksOfStream) {
            this.sendAndAwaitThenMark(task, neighborId)
        }
    }

    private sendAndAwaitThenMark({ message, source, handledNeighbors }: PropagationTask, neighborId: string): void {
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
                    this.activeTaskStore.delete(message.messageRef!)
                }
            })()
        }
    }
}
