import { formLookupKey } from './utils'
import LRU from '../../vendor/quick-lru'

type KeyType = (string | number | symbol)[]

interface BaseOptions<K extends KeyType, V> {
    valueFactory: (...args: K) => Promise<V>
}

interface CacheMapOptions<K extends KeyType, V> extends BaseOptions<K, V> {
    maxSize: number
    maxAge?: number
}

type LazyMapOptions<K extends KeyType, V> = BaseOptions<K, V>

interface Item<K, V> {
    key: K
    value: V
}

/*
 * A map that lazily creates values. The factory function is called only when a key
 * is accessed for the first time. Subsequent calls to `get()` return the cached value
 * unless it has been evicted due to `maxSize` or `maxAge` limits.
 */
export class Mapping<K extends KeyType, V> {

    private readonly cache: Map<string, Item<K, V>>
    private readonly pendingPromises: Map<string, Promise<V>> = new Map()
    private readonly opts: CacheMapOptions<K, V> | LazyMapOptions<K, V>

    /**
     * Prefer constructing the class via createCacheMap() and createLazyMap()
     * 
     * @internal 
     **/
    constructor(opts: CacheMapOptions<K, V> | LazyMapOptions<K, V>) {
        if ('maxSize' in opts) {
            this.cache = new LRU<string, Item<K, V>>({
                maxSize: opts.maxSize,
                maxAge: opts.maxAge
            })
        } else {
            this.cache = new Map<string, Item<K, V>>()
        }
        this.opts = opts
    }

    async get(...key: K): Promise<V> {
        const lookupKey = formLookupKey(...key)
        const pendingPromises = this.pendingPromises.get(lookupKey)
        if (pendingPromises !== undefined) {
            return await pendingPromises
        } else {
            let item = this.cache.get(lookupKey)
            if (item === undefined) {
                const promise = this.opts.valueFactory(...key)
                this.pendingPromises.set(lookupKey, promise)
                let value
                try {
                    value = await promise
                } finally {
                    this.pendingPromises.delete(lookupKey)
                }
                item = { key, value }
                this.cache.set(lookupKey, item)
            }
            return item.value
        }
    }

    set(key: K, value: V): void {
        this.cache.set(formLookupKey(...key), { key, value })
    }

    invalidate(predicate: (key: K) => boolean): void {
        for (const [lookupKey, item] of this.cache.entries()) {
            if (predicate(item.key)) {
                this.cache.delete(lookupKey)
            }
        }
    }

    *values(): IterableIterator<V> {
        for (const item of this.cache.values()) {
            yield item.value
        }
    }
}

export const createCacheMap = <K extends KeyType, V>(opts: CacheMapOptions<K, V>): Mapping<K, V> => {
    return new Mapping<K, V>(opts)
}

export const createLazyMap = <K extends KeyType, V>(opts: LazyMapOptions<K, V>): Mapping<K, V> => {
    return new Mapping<K, V>(opts)
}
