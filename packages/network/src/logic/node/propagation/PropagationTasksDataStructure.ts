import { MessageID } from 'streamr-client-protocol'
import { StreamIdAndPartition, StreamKey } from '../../../identifiers'
import LRUCache from 'lru-cache'

/**
 * Fixed-size cache for storing items (in practice: PropagationTasks) by MessageID. Designed for the
 * needs of message propagation logic.
 *
 * Properties:
 * - Allows look up by StreamIdAndPartition.
 * - Cache replacement policy is FIFO (when cache becomes full, first items to drop are the ones added first)
 * - Items have a TTL, after which they are considered stale and not returned when querying.
 *
 */
export class PropagationTasksDataStructure<T> {
    private readonly streamLookup = new Map<StreamKey, Set<MessageID>>()
    private readonly tasks: LRUCache<MessageID, T>

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

    add(messageId: MessageID, task: T): void {
        const stream = StreamIdAndPartition.fromMessage(messageId)
        if (!this.streamLookup.has(stream.key())) {
            this.streamLookup.set(stream.key(), new Set<MessageID>())
        }
        this.streamLookup.get(stream.key())!.add(messageId)
        this.tasks.set(messageId, task)
    }

    delete(messageId: MessageID): void {
        this.tasks.del(messageId)
    }

    get(stream: StreamIdAndPartition): Array<T> {
        const messageIds = this.streamLookup.get(stream.key())
        const tasks: Array<T> = []
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