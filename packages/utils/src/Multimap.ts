/**
 * Generic multimap: a key which maps to multiple valuess.
 * The values is an array
 * -> when we query the data, we get it back in the same order
 * -> an array may contain duplicates, if same value is added multiple times
 *    (we could implement a Multiset class if we need a different kind of duplication handling)
 **/
export class Multimap<K, V> {
    private readonly delegatee: Map<K, V[]> = new Map()

    get(key: K): V[] {
        return this.delegatee.get(key) ?? []
    }

    has(key: K, value: V): boolean {
        const items = this.delegatee.get(key)
        if (items !== undefined) {
            return items.includes(value)
        } else {
            return false
        }
    }

    add(key: K, value: V): void {
        this.delegatee.set(key, this.get(key).concat(value))
    }

    addAll(key: K, values: V[]): void {
        this.delegatee.set(key, this.get(key).concat(values))
    }

    remove(key: K, value: V): void {
        const items = this.delegatee.get(key)
        if (items !== undefined) {
            const newItems = items.filter((i) => i !== value)
            if (newItems.length > 0) {
                this.delegatee.set(key, newItems)
            } else {
                this.delegatee.delete(key)
            }
        }
    }

    removeAll(key: K, values: V[]): void {
        values.forEach((value) => this.remove(key, value))
    }

    *keys(): Generator<K, undefined, undefined> {
        yield* this.delegatee.keys()
    }

    *values(): Generator<V, undefined, undefined> {
        for (const k of this.keys()) {
            yield* this.get(k)
        }
    }

    getKeyCount(): number {
        return this.delegatee.size
    }

    isEmpty(): boolean {
        return this.getKeyCount() === 0
    }
}
