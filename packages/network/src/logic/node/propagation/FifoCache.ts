import assert from "assert"
import { List, Item } from "linked-list"

interface CacheItem<K, V> {
    value: V
    queueItem: QueueItem<K>
    expiresAt: number
}

class QueueItem<K> extends Item {
    readonly key: K

    constructor(key: K) {
        super()
        this.key = key
    }
}

export class FifoCache<K, V> {
    private readonly cache = new Map<K, CacheItem<K, V>>()
    private readonly queue = new List<QueueItem<K>>()
    private readonly ttlInMs: number
    private readonly maxSize: number
    private readonly timeProvider: () => number
    private readonly debugMode: boolean

    constructor(ttlInMs: number, maxSize: number, timeProvider = Date.now, debugMode = false) {
        if (ttlInMs < 0) {
            throw new Error(`ttlInMs (${ttlInMs}) cannot be < 0`)
        }
        if (maxSize < 0) {
            throw new Error(`maxSize (${maxSize}) cannot be < 0`)
        }
        this.ttlInMs = ttlInMs
        this.maxSize = maxSize
        this.timeProvider = timeProvider
        this.debugMode = debugMode
    }

    set(key: K, value: V): void {
        if (this.maxSize === 0) {
            return
        }
        while (this.cache.size >= this.maxSize) {
            const headOfQueue = this.queue.head
            if (headOfQueue === null) {
                // this should only happen if there is a bug in the implementation of this class
                throw new Error('invariant violated: queue empty but cache has still items')
            }
            headOfQueue.detach()
        }

        this.delete(key) // delete existing entry if exists

        const queueItem = this.queue.append(new QueueItem<K>(key))
        this.cache.set(key, {
            value,
            queueItem,
            expiresAt: this.timeProvider() + this.ttlInMs
        })
        this.checkInvariants()
    }

    delete(key: K): void {
        const cacheItem = this.cache.get(key)
        if (cacheItem !== undefined) {
            this.cache.delete(key)
            cacheItem.queueItem.detach()
            this.checkInvariants()
        }
    }

    get(key: K): V | undefined {
        const cacheItem = this.cache.get(key)
        if (cacheItem === undefined || cacheItem.expiresAt <= this.timeProvider()) {
            return undefined
        }
        return cacheItem.value
    }

    checkInvariants(): void {
        if (this.debugMode) {
            assert(this.cache.size === this.queue.size, 'cache.size !== queue.size')
            for (const queueItem of this.queue) {
                const key = queueItem.key
                assert(this.cache.has(key), `cache missing ${key} (which was found in queue)`)
                assert(this.cache.get(key)!.queueItem == queueItem, `cache queueItem !== item from queue`)
            }

        }
    }
}