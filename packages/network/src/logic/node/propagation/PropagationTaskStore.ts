import { MessageID, SPID, SPIDKey, StreamMessage } from 'streamr-client-protocol'
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
 * - Allows fetching propagation tasks by SPID
 * - Upper bound on number of tasks stored, replacement policy if FIFO
 * - Items have a TTL, after which they are considered stale and not returned when querying
**/
export class PropagationTaskStore {
    private readonly streamLookup = new Map<SPIDKey, Set<MessageID>>()
    private readonly tasks: FifoMapWithTtl<MessageID, PropagationTask>

    constructor(ttlInMs: number, maxTasks: number) {
        this.tasks = new FifoMapWithTtl<MessageID, PropagationTask>({
            ttlInMs,
            maxSize: maxTasks,
            onItemDropped: (messageId: MessageID) => {
                const stream = SPID.from(messageId)
                const messageIdsForStream = this.streamLookup.get(stream.toKey())
                if (messageIdsForStream !== undefined) {
                    messageIdsForStream.delete(messageId)
                    if (messageIdsForStream.size === 0) {
                        this.streamLookup.delete(stream.toKey())
                    }
                }
            }
        })
    }

    add(task: PropagationTask): void {
        const messageId = task.message.messageId
        const spidKey = SPID.from(messageId).toKey()
        if (!this.streamLookup.has(spidKey)) {
            this.streamLookup.set(spidKey, new Set<MessageID>())
        }
        this.streamLookup.get(spidKey)!.add(messageId)
        this.tasks.set(messageId, task)
    }

    delete(messageId: MessageID): void {
        this.tasks.delete(messageId) // causes `onKeyDropped` to be invoked
    }

    get(spid: SPID): Array<PropagationTask> {
        const messageIds = this.streamLookup.get(spid.toKey())
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
