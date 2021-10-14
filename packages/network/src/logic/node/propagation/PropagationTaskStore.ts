import { MessageID, StreamMessage } from 'streamr-client-protocol'
import { StreamIdAndPartition, StreamKey } from '../../../identifiers'
import { FifoMapWithTtl } from './FifoMapWithTtl'
import { NodeId } from '../Node'

export interface PropagationTask {
    message: StreamMessage
    source: NodeId | null
    handledNeighbors: Set<NodeId>
}

/**
 * Keeps track of propagation tasks for the needs of message propagation logic.
 *
 * Properties:
 * - Allows fetching propagation tasks by StreamIdAndPartition
 * - Upper bound on number of tasks stored, replacement policy if FIFO
 * - Items have a TTL, after which they are considered stale and not returned when querying
**/
export class PropagationTaskStore {
    private readonly streamLookup = new Map<StreamKey, Set<MessageID>>()
    private readonly tasks: FifoMapWithTtl<MessageID, PropagationTask>

    constructor(ttlInMs: number, maxTasks: number) {
        this.tasks = new FifoMapWithTtl<MessageID, PropagationTask>({
            ttlInMs,
            maxSize: maxTasks,
            onItemDropped: (messageId: MessageID) => {
                const stream = StreamIdAndPartition.fromMessage(messageId)
                const messageIdsForStream = this.streamLookup.get(stream.key())
                if (messageIdsForStream !== undefined) {
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
        if (messageIds !== undefined) {
            messageIds.forEach((messageId) => {
                const task = this.tasks.get(messageId)
                if (task !== undefined) { // should never be undefined if we don't have bugs
                    tasks.push(task)
                }
            })
        }
        return tasks
    }
}
