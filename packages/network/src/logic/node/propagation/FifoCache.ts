import fifo from 'fifo'

interface FifoItem<K> {
    key: K
    counter: number
}

interface CacheItem<V> {
    value: V
    counter: number
    expiresAt: number
}

class FifoCache<K, V> {
    private readonly cache = new Map<K, CacheItem<V>>()
    private readonly fifoQueue = fifo<FifoItem<K>>()
    private readonly ttlInMs
    private readonly maxSize
    private readonly timeProvider: () => number
    private counter = 0

    constructor(ttlInMs: number, maxSize: number, timeProvider = Date.now) {
        if (ttlInMs < 0) {
            throw new Error('ttlInMs cannot be < 0')
        }
        if (maxSize < 0) {
            throw new Error('maxSize cannot be < 0')
        }
        this.ttlInMs = ttlInMs
        this.maxSize = maxSize
        this.timeProvider = timeProvider
    }

    set(key: K, value: V): void {
        if (this.maxSize === 0) {
            return
        }
        while (this.cache.size >= this.maxSize) {
            const fifoNode = this.fifoQueue.pop()
            if (fifoNode === null) {
                // this should only happen if there is a bug in the implementation of this class
                throw new Error('invariant violated: fifoQueue empty but cache has still items')
            }
            const cacheItemForKey = this.cache.get(fifoNode.value.key)
            if (cacheItemForKey !== undefined && cacheItemForKey.counter === fifoNode.value.counter) {
                this.cache.delete(fifoNode.value.key)
            }
        }

        const counter = this.counter++
        this.cache.set(key, {
            value,
            counter,
            expiresAt: this.timeProvider() + this.ttlInMs
        })
        this.fifoQueue.push({
            key,
            counter
        })
    }

    delete(key: K): void {
        this.cache.delete(key)
    }

    get(key: K): V | undefined {
        const cacheItem = this.cache.get(key)
        if (cacheItem === undefined || cacheItem.expiresAt <= this.timeProvider()) {
            return undefined
        }
        return cacheItem.value
    }
}