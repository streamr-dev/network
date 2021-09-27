import { MessageID, StreamMessage } from 'streamr-client-protocol'
import { NodeId } from './Node'
import { StreamIdAndPartition, StreamKey } from '../identifiers'
import LRUCache from 'lru-cache'

interface PropagationTask {
    message: StreamMessage
    source: NodeId | null
    handledNeighbors: Set<NodeId>
}

/**
 * Data structure that (attempts to) store propagation tasks efficiently in-memory for the needs of
 * message propagation.
 *
 * Special properties:
 *  - A maximum of `maxConcurrentMessages` messages will be held.
 *      - Upon reaching the limit, each task added will remove a stale task.
 *      - The choice of stale task is FIFO (first item added to data structure will be removed first).
 *   - Ability to look up a set of tasks based on `StreamIdAndPartition`.
 */
class PropagationTasksDataStructure {
    private readonly streamLookup = new Map<StreamKey, Set<MessageID>>()
    private readonly tasks: LRUCache<MessageID, PropagationTask>

    constructor(ttl: number, maxConcurrentMessages: number) {
        this.tasks = new LRUCache({
            max: maxConcurrentMessages,
            maxAge: ttl,
            noDisposeOnSet: true,  // don't invoke dispose cb when overwriting key
            updateAgeOnGet: false, // make stale item removal effectively FIFO
            dispose: (messageId) => {
                const stream = StreamIdAndPartition.fromMessage(messageId)
                const messageIdsForStream = this.streamLookup.get(stream.key())
                if (messageIdsForStream) {
                    messageIdsForStream.delete(messageId)
                    if (messageIdsForStream.size === 0) {
                        this.streamLookup.delete(stream.key())
                    }
                }
            }
        })
    }

    add(task: PropagationTask): void {
        const messageId = task.message.messageId
        const stream = StreamIdAndPartition.fromMessage(messageId)
        if (!this.streamLookup.has(stream.key())) {
            this.streamLookup.set(stream.key(), new Set<MessageID>())
        }
        this.streamLookup.get(stream.key())!.add(messageId)
        this.tasks.set(messageId, task)
    }

    delete(task: PropagationTask): void {
        const messageId = task.message.messageId
        this.tasks.del(messageId)
    }

    get(stream: StreamIdAndPartition): Array<PropagationTask> {
        const messageIds = this.streamLookup.get(stream.key())
        const tasks: Array<PropagationTask> = []
        if (messageIds) {
            messageIds.forEach((messageId) => {
                const task = this.tasks.get(messageId)
                if (task) {
                    tasks.push(task)
                }
            })
        }
        return tasks
    }

}

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
const DEFAULT_TTL = 15 * 1000

/**
 * Implements the message propagation logic of a node. Given a message the logic will (re-)attempt propagate it to
 * `minPropagationTargets` neighbors until it either succeeds or time-to-live `ttl` milliseconds have passed.
 *
 * Setting `minPropagationTargets = 0` effectively disables any propagation reattempts. A message will then be
 * propagated exactly once, to neighbors that are present at that moment, in a fire-and-forget manner.
 */
export class Propagation {
    private readonly getNeighbors: GetNeighborsFn
    private readonly sendToNeighbor: SendToNeighborFn
    private readonly minPropagationTargets: number
    private readonly tasks: PropagationTasksDataStructure

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
        this.tasks = new PropagationTasksDataStructure(ttl, maxConcurrentMessages)
    }

    feedUnseenMessage(message: StreamMessage, source: NodeId | null): void {
        const messageId = message.getMessageID()
        const stream = StreamIdAndPartition.fromMessage(messageId)
        const targetNeighbors = this.getNeighbors(stream).filter((n) => n !== source)

        const handledNeighbors = new Set<NodeId>()
        targetNeighbors.forEach(async (neighborId) => {
            try {
                await this.sendToNeighbor(neighborId, message)
                handledNeighbors.add(neighborId)
            } catch (_e) {}
        })

        if (handledNeighbors.size < this.minPropagationTargets) {
            this.tasks.add({
                message,
                source,
                handledNeighbors
            })
        }
    }

    onNeighborJoined(neighborId: NodeId, stream: StreamIdAndPartition): void {
        const tasksOfStream = this.tasks.get(stream)
        if (tasksOfStream) {
            tasksOfStream.forEach(async (task) => {
                if (!task.handledNeighbors.has(neighborId) && neighborId !== task.source) {
                    try {
                        await this.sendToNeighbor(neighborId, task.message)
                        task.handledNeighbors.add(neighborId)
                    } catch (_e) {}
                    if (task.handledNeighbors.size >= this.minPropagationTargets) {
                        this.tasks.delete(task)
                    }
                }
            })
        }
    }
}