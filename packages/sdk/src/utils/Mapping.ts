import { LRUCache } from 'lru-cache'
import { MarkRequired } from 'ts-essentials'
import { formLookupKey, LookupKeyType } from './utils'

interface BaseOptions<K extends LookupKeyType, V> {
    valueFactory: (key: K) => Promise<V>
    isCacheableValue?: (value: V) => boolean
}

interface CacheMapOptions<K extends LookupKeyType, V> extends BaseOptions<K, V> {
    maxSize: number
    maxAge?: number
}

type LazyMapOptions<K extends LookupKeyType, V> = BaseOptions<K, V>

interface Item<K, V> {
    key: K
    value: V
}

interface CacheMap<K extends string, V> {
    get(key: K): V | undefined
    set(key: K, value: V): void
    delete(key: K): void
    values(): Iterable<V>
    entries(): Iterable<[K, V]>
}

/*
 * A map that lazily creates values. The factory function is called only when a key
 * is accessed for the first time. Subsequent calls to `get()` return the cached value
 * unless it has been evicted due to `maxSize` or `maxAge` limits.
 *
 * It is possible to implement e.g. positive cache by using `isCacheableValue()`
 * config option. If that method returns `false`, the value is not stored to cache.
 * Note that using this option doesn't change the concurrent promise handling:
 * also in this case all concurrent `get()` calls are grouped so that only one
 * call to `valueFactory` is made. (If we wouldn't group these calls, all concurrent
 * `get()` calls were cache misses, i.e. affecting significantly cases where the
 * `isCacheableValue()` returns `true`.)
 */
export class Mapping<K extends LookupKeyType, V> {
    private readonly delegate: CacheMap<string, Item<K, V>>
    private readonly pendingPromises: Map<string, Promise<V>> = new Map()
    private readonly opts: MarkRequired<CacheMapOptions<K, V> | LazyMapOptions<K, V>, 'isCacheableValue'>

    /**
     * Prefer constructing the class via createCacheMap() and createLazyMap()
     *
     * @internal
     **/
    constructor(opts: CacheMapOptions<K, V> | LazyMapOptions<K, V>) {
        if ('maxSize' in opts) {
            this.delegate = new LRUCache<string, Item<K, V>>({
                maxSize: opts.maxSize,
                sizeCalculation: () => 1,
                ttl: opts.maxAge
            })
        } else {
            this.delegate = new Map<string, Item<K, V>>()
        }
        this.opts = {
            isCacheableValue: () => true,
            ...opts
        }
    }

    async get(key: K): Promise<V> {
        const lookupKey = formLookupKey(key)
        const pendingPromise = this.pendingPromises.get(lookupKey)
        if (pendingPromise !== undefined) {
            return await pendingPromise
        } else {
            let item = this.delegate.get(lookupKey)
            if (item === undefined) {
                const promise = this.opts.valueFactory(key)
                this.pendingPromises.set(lookupKey, promise)
                let value
                try {
                    value = await promise
                } finally {
                    this.pendingPromises.delete(lookupKey)
                }
                item = { key, value }
                if (this.opts.isCacheableValue(value)) {
                    this.delegate.set(lookupKey, item)
                }
            }
            return item.value
        }
    }

    set(key: K, value: V): void {
        this.delegate.set(formLookupKey(key), { key, value })
    }

    invalidate(predicate: (key: K) => boolean): void {
        for (const [lookupKey, item] of this.delegate.entries()) {
            if (predicate(item.key)) {
                this.delegate.delete(lookupKey)
            }
        }
    }

    *values(): IterableIterator<V> {
        for (const item of this.delegate.values()) {
            yield item.value
        }
    }
}

export const createCacheMap = <K extends LookupKeyType, V>(opts: CacheMapOptions<K, V>): Mapping<K, V> => {
    return new Mapping<K, V>(opts)
}

export const createLazyMap = <K extends LookupKeyType, V>(opts: LazyMapOptions<K, V>): Mapping<K, V> => {
    return new Mapping<K, V>(opts)
}
