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
    private readonly spidLookup = new Map<SPIDKey, Set<MessageID>>()
    private readonly tasks: FifoMapWithTtl<MessageID, PropagationTask>

    constructor(ttlInMs: number, maxTasks: number) {
        this.tasks = new FifoMapWithTtl<MessageID, PropagationTask>({
            ttlInMs,
            maxSize: maxTasks,
            onItemDropped: (messageId: MessageID) => {
                const spid = SPID.from(messageId)
                const messageIdsForSPID = this.spidLookup.get(spid.toKey())
                if (messageIdsForSPID !== undefined) {
                    messageIdsForSPID.delete(messageId)
                    if (messageIdsForSPID.size === 0) {
                        this.spidLookup.delete(spid.toKey())
                    }
                }
            }
        })
    }

    add(task: PropagationTask): void {
        const messageId = task.message.messageId
        const spidKey = SPID.from(messageId).toKey()
        if (!this.spidLookup.has(spidKey)) {
            this.spidLookup.set(spidKey, new Set<MessageID>())
        }
        this.spidLookup.get(spidKey)!.add(messageId)
        this.tasks.set(messageId, task)
    }

    delete(messageId: MessageID): void {
        this.tasks.delete(messageId) // causes `onKeyDropped` to be invoked
    }

    get(spid: SPID): Array<PropagationTask> {
        const messageIds = this.spidLookup.get(spid.toKey())
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
