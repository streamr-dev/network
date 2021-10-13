import { StreamMessage } from 'streamr-client-protocol'
import { NodeId } from '../Node'
import { StreamIdAndPartition } from '../../../identifiers'
import { ActivePropagationTaskStore } from './ActivePropagationTaskStore'

type GetNeighborsFn = (stream: StreamIdAndPartition) => ReadonlyArray<NodeId>

type SendToNeighborFn = (neighborId: NodeId, msg: StreamMessage) => Promise<unknown>

type ConstructorOptions = {
    getNeighbors: GetNeighborsFn
    sendToNeighbor: SendToNeighborFn
    minPropagationTargets: number
    ttl?: number
    maxConcurrentMessages?: number
}

const DEFAULT_MAX_CONCURRENT_MESSAGES = 10000
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
    private readonly activeTaskStore: ActivePropagationTaskStore

    constructor({
        getNeighbors,
        sendToNeighbor,
        minPropagationTargets,
        ttl = DEFAULT_TTL,
        maxConcurrentMessages = DEFAULT_MAX_CONCURRENT_MESSAGES
    }: ConstructorOptions) {
        this.getNeighbors = getNeighbors
        this.sendToNeighbor = sendToNeighbor
        this.minPropagationTargets = minPropagationTargets
        this.activeTaskStore = new ActivePropagationTaskStore(ttl, maxConcurrentMessages)
    }

    feedUnseenMessage(message: StreamMessage, source: NodeId | null): void {
        const stream = StreamIdAndPartition.fromMessage(message.messageId)
        const targetNeighbors = this.getNeighbors(stream).filter((n) => n !== source)

        const handledNeighbors = new Set<NodeId>()
        targetNeighbors.forEach(async (neighborId) => {
            try {
                await this.sendToNeighbor(neighborId, message)
                handledNeighbors.add(neighborId)
            } catch (_e) {}
        })

        if (handledNeighbors.size < this.minPropagationTargets) {
            this.activeTaskStore.add({
                message,
                source,
                handledNeighbors
            })
        }
    }

    onNeighborJoined(neighborId: NodeId, stream: StreamIdAndPartition): void {
        const tasksOfStream = this.activeTaskStore.get(stream)
        if (tasksOfStream) {
            tasksOfStream.forEach(async (task) => {
                if (!task.handledNeighbors.has(neighborId) && neighborId !== task.source) {
                    try {
                        await this.sendToNeighbor(neighborId, task.message)
                        task.handledNeighbors.add(neighborId)
                    } catch (_e) {}
                    if (task.handledNeighbors.size >= this.minPropagationTargets) {
                        this.activeTaskStore.delete(task.message.messageId)
                    }
                }
            })
        }
    }
}