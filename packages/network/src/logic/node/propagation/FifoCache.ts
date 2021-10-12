import assert from "assert"
import Yallist from "yallist"

interface CacheItem<K, V> {
    value: V
    fifoQueueNode: Yallist.Node<K>
    expiresAt: number
}

export interface FifoCacheOptions<K> {
    ttlInMs: number
    maxSize: number
    onKeyDropped?: (key: K) => void
    timeProvider?: () => number
    debugMode?: boolean
}

export class FifoCache<K, V> {
    private readonly cache = new Map<K, CacheItem<K, V>>()
    private readonly fifoQueue = Yallist.create<K>()
    private readonly ttlInMs: number
    private readonly maxSize: number
    private readonly onKeyDropped: (key: K) => void
    private readonly timeProvider: () => number
    private readonly debugMode: boolean

    constructor({
        ttlInMs,
        maxSize,
        onKeyDropped = () => {},
        timeProvider = Date.now,
        debugMode = false
    }: FifoCacheOptions<K>) {
        if (ttlInMs < 0) {
            throw new Error(`ttlInMs (${ttlInMs}) cannot be < 0`)
        }
        if (maxSize < 0) {
            throw new Error(`maxSize (${maxSize}) cannot be < 0`)
        }
        this.ttlInMs = ttlInMs
        this.maxSize = maxSize
        this.onKeyDropped = onKeyDropped
        this.timeProvider = timeProvider
        this.debugMode = debugMode
    }

    set(key: K, value: V): void {
        if (this.maxSize === 0) {
            return
        }

        // delete an existing entry if exists
        this.delete(key)

        // make room for new entry
        while (this.cache.size >= this.maxSize) {
            const keyToDel = this.fifoQueue.shift()
            if (keyToDel === undefined) {
                // this should only happen if there is a bug in the implementation of this class
                throw new Error('invariant violated: queue empty but cache has still items')
            }
            this.cache.delete(keyToDel)
            this.onKeyDropped(keyToDel)
        }

        // add entry
        const fifoQueueNode = Yallist.Node<K>(key)
        this.fifoQueue.pushNode(fifoQueueNode)
        this.cache.set(key, {
            value,
            fifoQueueNode,
            expiresAt: this.timeProvider() + this.ttlInMs
        })

        this.checkInvariants()
    }

    delete(key: K): void {
        const cacheItem = this.cache.get(key)
        if (cacheItem !== undefined) {
            this.cache.delete(key)
            this.fifoQueue.removeNode(cacheItem.fifoQueueNode)
            this.onKeyDropped(key)
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

    /**
     * Debug method to validate that class invariants hold. Namely,
    *      1. The size of the cache and the FIFO linked list should always be equal
    *      2. The set of keys present in the cache and the FIFO linked list is the same.
     */
    private checkInvariants(): void {
        if (this.debugMode) {
            assert(this.cache.size === this.fifoQueue.length, 'cache.size !== queue.size')
            let node = this.fifoQueue.head
            while (node !== null) {
                const key = node.value
                assert(this.cache.has(key), `cache missing ${key} (which was found in queue)`)
                assert(this.cache.get(key)!.fifoQueueNode == node, `cache queueItem !== node from queue`)
                node = node.next
            }
        }
    }
}