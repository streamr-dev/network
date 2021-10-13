import { MessageID, StreamMessage } from 'streamr-client-protocol'
import { StreamIdAndPartition, StreamKey } from '../../../identifiers'
import { FifoCache } from './FifoCache'
import { NodeId } from '../Node'

export interface PropagationTask {
    message: StreamMessage
    source: NodeId | null
    handledNeighbors: Set<NodeId>
}

/**
 * Keeps track of active propagation tasks for the needs of message propagation logic.
 *
 * Properties:
 * - Upper bound on number of tasks stored, replacement policy if FIFO
 * - Allows fetching propagation tasks by StreamIdAndPartition
 * - Items have a TTL, after which they are considered stale and not returned when querying
**/
export class ActivePropagationTaskStore {
    private readonly streamLookup = new Map<StreamKey, Set<MessageID>>()
    private readonly tasks: FifoCache<MessageID, PropagationTask>

    constructor(ttl: number, maxConcurrentMessages: number) {
        this.tasks = new FifoCache<MessageID, PropagationTask>({
            ttlInMs: ttl,
            maxSize: maxConcurrentMessages,
            onKeyDropped: (messageId: MessageID) => {
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

    delete(messageId: MessageID): void {
        this.tasks.delete(messageId) // causes `onKeyDropped` to be invoked
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
