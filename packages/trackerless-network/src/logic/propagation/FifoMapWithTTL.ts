import { Node, Yallist } from 'yallist'

interface Item<K, V> {
    value: V
    dropQueueNode: Node<K>
    expiresAt: number
}

export interface FifoMapWithTtlOptions<K> {
    ttlInMs: number
    maxSize: number
    onItemDropped?: (key: K) => void
    timeProvider?: () => number
    debugMode?: boolean
}

/**
 * A "Map" implementation with a maximum size and TTL expiration on entries.
 *
 * When full, room is made for new entries by dropping existing by FIFO method.
 *
 * Entries have a TTL after which they are considered stale. Stale items are
 * not returned when querying.
 *
 */
export class FifoMapWithTTL<K, V> {
    // class invariant: the keys present in `items` and `dropQueue` are the same set.
    private readonly items = new Map<K, Item<K, V>>()
    private readonly dropQueue = Yallist.create<K>() // queue is used to determine deletion order when full
    private readonly ttlInMs: number
    private readonly maxSize: number
    private readonly onItemDropped: (key: K) => void
    private readonly timeProvider: () => number

    constructor({ ttlInMs, maxSize, onItemDropped = () => {}, timeProvider = Date.now }: FifoMapWithTtlOptions<K>) {
        if (ttlInMs < 0) {
            throw new Error(`ttlInMs (${ttlInMs}) cannot be < 0`)
        }
        if (maxSize < 0) {
            throw new Error(`maxSize (${maxSize}) cannot be < 0`)
        }
        this.ttlInMs = ttlInMs
        this.maxSize = maxSize
        this.onItemDropped = onItemDropped
        this.timeProvider = timeProvider
    }

    set(key: K, value: V): void {
        if (this.maxSize === 0) {
            return
        }
        if (this.items.size > this.maxSize) {
            throw new Error('assertion error: maximum size exceeded')
        }

        // delete an existing entry if exists
        this.delete(key)

        // make room for new entry
        if (this.items.size === this.maxSize) {
            const keyToDel = this.dropQueue.shift()
            if (keyToDel === undefined) {
                throw new Error('assertion error: queue empty but still have items')
            }
            this.items.delete(keyToDel)
            this.onItemDropped(keyToDel)
        }

        // add entry
        const dropQueueNode = new Node<K>(key)
        this.dropQueue.pushNode(dropQueueNode)
        this.items.set(key, {
            value,
            dropQueueNode,
            expiresAt: this.timeProvider() + this.ttlInMs
        })
    }

    delete(key: K): void {
        const item = this.items.get(key)
        if (item !== undefined) {
            this.items.delete(key)
            this.dropQueue.removeNode(item.dropQueueNode)
            this.onItemDropped(key)
        }
    }

    get(key: K): V | undefined {
        const item = this.items.get(key)
        if (item === undefined) {
            return undefined
        }
        if (item.expiresAt <= this.timeProvider()) {
            this.delete(key)
            return undefined
        }
        return item.value
    }

    values(): V[] {
        const keys = [...this.items.keys()]
        const values = []
        for (const key of keys) {
            const value = this.get(key)
            if (value !== undefined) {
                values.push(value)
            }
        }
        return values
    }
}
