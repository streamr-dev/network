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

    private delegate: Map<string, ValueWrapper<V>> = new Map()
    private valueFactory: (...args: K) => Promise<V>

    constructor(valueFactory: (...args: K) => Promise<V>) {
        this.valueFactory = valueFactory
    }

    async get(...args: K): Promise<V> {
        const key = formLookupKey(...args)
        let valueWrapper = this.delegate.get(key)
        if (valueWrapper === undefined) {
            const value = await this.valueFactory(...args)
            valueWrapper = { value }
            this.delegate.set(key, valueWrapper)
        }
        return valueWrapper.value
    }
}
