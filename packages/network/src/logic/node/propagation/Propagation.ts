import { StreamMessage } from 'streamr-client-protocol'
import { NodeId } from '../Node'
import { StreamIdAndPartition } from '../../../identifiers'
import { PropagationTasksDataStructure } from './PropagationTasksDataStructure'

type GetNeighborsFn = (stream: StreamIdAndPartition) => ReadonlyArray<NodeId>

type SendToNeighborFn = (neighborId: NodeId, msg: StreamMessage) => Promise<unknown>

interface PropagationTask {
    message: StreamMessage
    source: NodeId | null
    handledNeighbors: Set<NodeId>
}

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
    private readonly tasks: PropagationTasksDataStructure<PropagationTask>

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
        this.tasks = new PropagationTasksDataStructure<PropagationTask>(ttl, maxConcurrentMessages)
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
            this.tasks.add(messageId, {
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
                        this.tasks.delete(task.message.messageId)
                    }
                }
            })
        }
    }
}