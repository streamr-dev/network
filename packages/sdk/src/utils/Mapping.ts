import { formLookupKey } from './utils'
import LRU from '../../vendor/quick-lru'
import { MarkRequired } from 'ts-essentials'

type KeyType = (string | number)[]

interface BaseOptions<K extends KeyType, V> {
    valueFactory: (...args: K) => Promise<V>
    isCacheableValue?: (value: V) => boolean
}

interface CacheMapOptions<K extends KeyType, V> extends BaseOptions<K, V> {
    maxSize: number
    maxAge?: number
}

type LazyMapOptions<K extends KeyType, V> = BaseOptions<K, V>

// an wrapper object is used so that we can store undefined values
interface ValueWrapper<V> {
    value: V
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
export class Mapping<K extends KeyType, V> {

    private readonly delegate: Map<string, ValueWrapper<V>>
    private readonly pendingPromises: Map<string, Promise<V>> = new Map()
    private readonly opts: MarkRequired<CacheMapOptions<K, V> | LazyMapOptions<K, V>, 'isCacheableValue'>

    /**
     * Prefer constructing the class via createCacheMap() and createLazyMap()
     * 
     * @internal 
     **/
    constructor(opts: CacheMapOptions<K, V> | LazyMapOptions<K, V>) {
        if ('maxSize' in opts) {
            this.delegate = new LRU<string, ValueWrapper<V>>({
                maxSize: opts.maxSize,
                maxAge: opts.maxAge
            })
        } else {
            this.delegate = new Map<string, ValueWrapper<V>>()
        }
        this.opts = {
            isCacheableValue: () => true,
            ...opts
        }
    }

    async get(...args: K): Promise<V> {
        const key = formLookupKey(...args)
        const pendingPromise = this.pendingPromises.get(key)
        if (pendingPromise !== undefined) {
            return await pendingPromise
        } else {
            let valueWrapper = this.delegate.get(key)
            if (valueWrapper === undefined) {
                const promise = this.opts.valueFactory(...args)
                this.pendingPromises.set(key, promise)
                let value
                try {
                    value = await promise
                } finally {
                    this.pendingPromises.delete(key)
                }
                valueWrapper = { value }
                if (this.opts.isCacheableValue(value)) {
                    this.delegate.set(key, valueWrapper)
                }
            }
            return valueWrapper.value
        }
    }

    values(): V[] {
        const result: V[] = []
        for (const wrapper of this.delegate.values()) {
            result.push(wrapper.value)
        }
        return result
    }
}

export const createCacheMap = <K extends KeyType, V>(opts: CacheMapOptions<K, V>): Mapping<K, V> => {
    return new Mapping<K, V>(opts)
}

export const createLazyMap = <K extends KeyType, V>(opts: LazyMapOptions<K, V>): Mapping<K, V> => {
    return new Mapping<K, V>(opts)
}
