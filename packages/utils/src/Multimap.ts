/**
 * Generic multimap: a key which maps to multiple valuess.
 * The values is an array
 * -> when we query the data, we get it back in the same order
 * -> an array may contain duplicates, if same value is added multiple times
 *    (we could implement a Multiset class if we need a different kind of duplication handling)
 *
 * TODO: implement some unit tests if this is not just a test helper class.
 **/
export class Multimap<K, V> {
    private readonly values: Map<K, V[]> = new Map()

    get(key: K): V[] {
        return this.values.get(key) ?? []
    }

    has(key: K, value: V): boolean {
        const items = this.values.get(key)
        if (items !== undefined) {
            return items.includes(value)
            // eslint-disable-next-line no-else-return
        } else {
            return false
        }
    }

    add(key: K, value: V): void {
        this.values.set(key, this.get(key).concat(value))
    }

    addAll(key: K, values: V[]): void {
        this.values.set(key, this.get(key).concat(values))
    }

    remove(key: K, value: V): void {
        const items = this.values.get(key)
        if (items !== undefined) {
            const newItems = items.filter((i) => i !== value)
            if (newItems.length > 0) {
                this.values.set(key, newItems)
            } else {
                this.values.delete(key)
            }
        }
    }

    removeAll(key: K, values: V[]): void {
        values.forEach((value) => this.remove(key, value))
    }

    keys(): K[] {
        return Array.from(this.values.keys())
    }
}
