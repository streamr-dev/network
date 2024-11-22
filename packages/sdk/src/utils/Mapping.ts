import { formLookupKey } from './utils'
import LRU from '../../vendor/quick-lru'
import { MarkRequired } from 'ts-essentials'

type KeyType = (string | number)[]

interface Options<K extends KeyType, V> {
    valueFactory: (...args: K) => Promise<V>
    isCacheableValue?: (value: V) => boolean
    maxSize: number
    maxAge?: number
}

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

    private readonly cache: LRU<string, ValueWrapper<V>>
    private readonly pendingPromises: Map<string, Promise<V>> = new Map()
    private readonly opts: MarkRequired<Options<K, V>, 'isCacheableValue'>

    constructor(opts: Options<K, V>) {
        this.cache = new LRU<string, ValueWrapper<V>>({
            maxSize: opts.maxSize,
            maxAge: opts.maxAge
        })
        this.opts = {
            isCacheableValue: () => true,
            ...opts
        }
    }

    async get(...args: K): Promise<V> {
        const key = formLookupKey(...args)
        const pendingPromises = this.pendingPromises.get(key)
        if (pendingPromises !== undefined) {
            return await pendingPromises
        } else {
            let valueWrapper = this.cache.get(key)
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
                    this.cache.set(key, valueWrapper)
                }
            }
            return valueWrapper.value
        }
    }

    values(): V[] {
        const result: V[] = []
        for (const wrapper of this.cache.values()) {
            result.push(wrapper.value)
        }
        return result
    }
}
