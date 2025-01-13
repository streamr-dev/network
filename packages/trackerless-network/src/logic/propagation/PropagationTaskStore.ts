import { DhtAddress } from '@streamr/dht'
import { MessageRef, StreamMessage } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { FifoMapWithTTL } from './FifoMapWithTTL'

export interface PropagationTask {
    message: StreamMessage
    source: string | null
    handledNeighbors: Set<DhtAddress>
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
    private readonly tasks: FifoMapWithTTL<MessageRef, PropagationTask>

    constructor(ttlInMs: number, maxTasks: number) {
        this.tasks = new FifoMapWithTTL<MessageRef, PropagationTask>({
            ttlInMs,
            maxSize: maxTasks
        })
    }

    get(): PropagationTask[] {
        return this.tasks.values()
    }

    add(task: PropagationTask): void {
        const messageId = task.message.messageId!
        this.tasks.set(messageId, task)
    }

    delete(messageId: MessageRef): void {
        this.tasks.delete(messageId) // causes `onKeyDropped` to be invoked
    }
}
