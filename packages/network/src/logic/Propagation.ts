import { MessageID, StreamMessage } from 'streamr-client-protocol'
import { NodeId } from './Node'
import { StreamIdAndPartition, StreamKey } from '../identifiers'
import { Logger } from '../helpers/Logger'

type GetNeighborsFn = (stream: StreamIdAndPartition) => ReadonlyArray<NodeId>

type SendToNeighborFn = (neighborId: NodeId, msg: StreamMessage) => Promise<unknown>

const DEFAULT_MAX_CONCURRENT_MESSAGES = 10000
const DEFAULT_TTL = 15 * 1000

interface PropagationTask {
    message: StreamMessage
    source: NodeId | null
    handledNeighbors: Set<NodeId>
    ttlTimeout: NodeJS.Timeout
}

type ConstructorOptions = {
    getNeighbors: GetNeighborsFn
    sendToNeighbor: SendToNeighborFn
    minPropagationTargets: number
    ttl?: number
    maxConcurrentMessages?: number
}

const logger = new Logger(module)

function logPropagation(messageId: MessageID, neighbors: Set<NodeId>): void {
    logger.trace('StreamMessage{%j} was propagated to %j', messageId.toArray(), [...neighbors])
}

export class Propagation {
    private readonly tasks = new Map<StreamKey, Map<MessageID, PropagationTask>>()
    private readonly getNeighbors: GetNeighborsFn
    private readonly sendToNeighbor: SendToNeighborFn
    private readonly minPropagationTargets: number
    private readonly ttl: number
    private readonly maxConcurrentMessages: number
    private totalTasks = 0

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
        this.ttl = ttl
        this.maxConcurrentMessages = maxConcurrentMessages
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

        if (handledNeighbors.size < this.minPropagationTargets && this.totalTasks < this.maxConcurrentMessages) {
            if (!this.tasks.has(stream.key())) {
                this.tasks.set(stream.key(), new Map<MessageID, PropagationTask>())
            }
            this.tasks.get(stream.key())!.set(messageId, {
                message,
                source,
                handledNeighbors,
                ttlTimeout: setTimeout(() => {
                    this.delete(messageId)
                }, this.ttl)
            })
            this.totalTasks += 1
        } else {
            logPropagation(messageId, handledNeighbors)
        }
    }

    onNeighborJoined(neighborId: NodeId, stream: StreamIdAndPartition): void {
        const tasksOfStream = this.tasks.get(stream.key())
        if (tasksOfStream) {
            tasksOfStream.forEach(async (task, messageId) => {
                if (!task.handledNeighbors.has(neighborId) && neighborId !== task.source) {
                    try {
                        await this.sendToNeighbor(neighborId, task.message)
                        task.handledNeighbors.add(neighborId)
                    } catch (_e) {}
                    if (task.handledNeighbors.size >= this.minPropagationTargets) {
                        this.delete(messageId)
                    }
                }
            })
        }
    }

    stop(): void {
        this.tasks.forEach((streamTasks) => {
            for (const messageId of streamTasks.keys()) {
                this.delete(messageId)
            }
        })
    }

    private delete(messageId: MessageID): void {
        const stream = StreamIdAndPartition.fromMessage(messageId)
        const streamTasks = this.tasks.get(stream.key())
        if (streamTasks) {
            const task = streamTasks.get(messageId)
            if (task) {
                clearTimeout(task.ttlTimeout)
                this.tasks.get(stream.key())!.delete(messageId)
                this.totalTasks -= 1
                logPropagation(messageId, task.handledNeighbors)
            }
            if (streamTasks.size === 0) {
                this.tasks.delete(stream.key())
            }
        }
    }
}