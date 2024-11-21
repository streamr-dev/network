import { formLookupKey } from './utils'

// an wrapper object is used so that we can store undefined values
interface ValueWrapper<V> {
    value: V
}

/*
 * A map data structure which lazily evaluates values. A factory function
 * is called to create a value when when an item is queried for the first time.
 * The map stores the value and any subsequent call to get() returns
 * the same value.
 */
export class Mapping<K extends (string | number)[], V> {

    private readonly delegate: Map<string, ValueWrapper<V>> = new Map()
    private readonly pendingPromises: Map<string, Promise<V>> = new Map()
    private readonly valueFactory: (...args: K) => Promise<V>

    constructor(valueFactory: (...args: K) => Promise<V>) {
        this.valueFactory = valueFactory
    }

    async get(...args: K): Promise<V> {
        const key = formLookupKey(...args)
        const pendingPromises = this.pendingPromises.get(key)
        if (pendingPromises !== undefined) {
            return await pendingPromises
        } else {
            let valueWrapper = this.delegate.get(key)
            if (valueWrapper === undefined) {
                const promise = this.valueFactory(...args)
                this.pendingPromises.set(key, promise)
                let value
                try {
                    value = await promise
                } finally {
                    this.pendingPromises.delete(key)
                }
                valueWrapper = { value }
                this.delegate.set(key, valueWrapper)
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
