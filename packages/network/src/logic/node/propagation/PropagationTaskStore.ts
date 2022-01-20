import { MessageID, StreamPartID, StreamMessage } from 'streamr-client-protocol'
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
 * - Allows fetching propagation tasks by StreamPartID
 * - Upper bound on number of tasks stored, replacement policy if FIFO
 * - Items have a TTL, after which they are considered stale and not returned when querying
**/
export class PropagationTaskStore {
    private readonly streamPartLookup = new Map<StreamPartID, Set<MessageID>>()
    private readonly tasks: FifoMapWithTtl<MessageID, PropagationTask>

    constructor(ttlInMs: number, maxTasks: number) {
        this.tasks = new FifoMapWithTtl<MessageID, PropagationTask>({
            ttlInMs,
            maxSize: maxTasks,
            onItemDropped: (messageId: MessageID) => {
                const streamPartId = messageId.getStreamPartID()
                const messageIdsForStream = this.streamPartLookup.get(streamPartId)
                if (messageIdsForStream !== undefined) {
                    messageIdsForStream.delete(messageId)
                    if (messageIdsForStream.size === 0) {
                        this.streamPartLookup.delete(streamPartId)
                    }
                }
            }
        })
    }

    add(task: PropagationTask): void {
        const messageId = task.message.messageId
        const streamPartId = messageId.getStreamPartID()
        if (!this.streamPartLookup.has(streamPartId)) {
            this.streamPartLookup.set(streamPartId, new Set<MessageID>())
        }
        this.streamPartLookup.get(streamPartId)!.add(messageId)
        this.tasks.set(messageId, task)
    }

    delete(messageId: MessageID): void {
        this.tasks.delete(messageId) // causes `onKeyDropped` to be invoked
    }

    get(streamPartId: StreamPartID): Array<PropagationTask> {
        const messageIds = this.streamPartLookup.get(streamPartId)
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
