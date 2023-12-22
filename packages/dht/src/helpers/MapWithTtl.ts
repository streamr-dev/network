interface ValueWrapper<V> {
    value: V
    timeout: NodeJS.Timeout
}

export class MapWithTtl<K, V> {

    private readonly delegate: Map<K, ValueWrapper<V>> = new Map()
    private readonly getTtl: (value: V) => number

    constructor(getTtl: (value: V) => number) {
        this.getTtl = getTtl
    }

    set(key: K, value: V): void {
        const existing = this.delegate.get(key)
        if (existing !== undefined) {
            clearTimeout(existing.timeout)
        }
        this.delegate.set(key, {
            value,
            timeout: this.createTimeout(key, value)
        })
    }

    get(key: K): V | undefined {
        const wrapper = this.delegate.get(key)
        return wrapper?.value
    }

    has(key: K): boolean {
        return this.delegate.has(key)
    }

    delete(key: K): void {
        const existing = this.delegate.get(key)
        if (existing !== undefined) {
            clearTimeout(existing.timeout)
            this.delegate.delete(key)
        }
    }

    clear(): void {
        this.delegate.forEach((value) => {
            clearTimeout(value.timeout)
        })
        this.delegate.clear()
    }

    size(): number {
        return this.delegate.size
    }

    *values(): IterableIterator<V> {
        for (const v of this.delegate.values()) {
            yield v.value
        }
    }

    forEach(cb: (value: V, key: K) => void): void {
        this.delegate.forEach((valueWrapper: ValueWrapper<V>, key: K) => {
            cb(valueWrapper.value, key)
        })
    }

    private createTimeout(key: K, value: V): NodeJS.Timeout {
        return setTimeout(() => {
            this.delete(key)
        }, this.getTtl(value))
    }
}
