import { formLookupKey } from './utils'
import LRU from '../../vendor/quick-lru'

type KeyType = (string | number)[]

type Options<K extends KeyType, V> = {
    valueFactory: (...args: K) => Promise<V>
} & ({
    maxSize: number
    maxAge?: number
} | {
    maxSize?: never
    maxAge?: never
})

// an wrapper object is used so that we can store undefined values
interface ValueWrapper<V> {
    value: V
}

/*
 * A map that lazily creates values. The factory function is called only when a key
 * is accessed for the first time. Subsequent calls to `get()` return the cached value
 * unless it has been evicted due to `maxSize` or `maxAge` limits.
 */
export class Mapping<K extends KeyType, V> {

    private readonly cache: Map<string, ValueWrapper<V>>
    private readonly pendingPromises: Map<string, Promise<V>> = new Map()
    private readonly opts: Options<K, V>

    constructor(opts: Options<K, V>) {
        if (opts.maxSize !== undefined) {
            this.cache = new LRU<string, ValueWrapper<V>>({
                maxSize: opts.maxSize,
                maxAge: opts.maxAge
            })
        } else {
            this.cache = new Map<string, ValueWrapper<V>>()
        }
        this.opts = opts
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
                this.cache.set(key, valueWrapper)
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
