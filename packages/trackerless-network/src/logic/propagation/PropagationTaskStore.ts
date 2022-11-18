import { MessageRef, StreamMessage } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { FifoMapWithTtl } from './FifoMapWithTTL'

export interface PropagationTask {
    message: StreamMessage
    source: string | null
    handledNeighbors: Set<string>
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
    private readonly tasks: FifoMapWithTtl<MessageRef, PropagationTask>

    constructor(ttlInMs: number, maxTasks: number) {
        this.tasks = new FifoMapWithTtl<MessageRef, PropagationTask>({
            ttlInMs,
            maxSize: maxTasks
        })
    }

    get(): PropagationTask[] {
        return this.tasks.values().map((task) => task.value)
    }

    add(task: PropagationTask): void {
        const messageId = task.message.messageRef!
        this.tasks.set(messageId, task)
    }

    delete(messageId: MessageRef): void {
        this.tasks.delete(messageId) // causes `onKeyDropped` to be invoked
    }
}
