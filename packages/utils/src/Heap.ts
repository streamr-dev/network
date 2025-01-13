export class Heap<T> {
    private readonly items: T[]
    private readonly compare: (item1: T, item2: T) => number

    constructor(compare: (item1: T, item2: T) => number) {
        this.items = []
        this.compare = compare
    }

    push(item: T): void {
        const index = this.getItemIndex(item)
        this.items.splice(index, 0, item)
    }

    pop(): T | undefined {
        return this.items.shift()
    }

    peek(): T | undefined {
        if (!this.isEmpty()) {
            return this.items[0]
        } else {
            return undefined
        }
    }

    contains(item: T): boolean {
        if (!this.isEmpty()) {
            const index = this.getItemIndex(item)
            if (index !== this.items.length) {
                return this.compare(this.items[index], item) === 0
            }
        }
        return false
    }

    isEmpty(): boolean {
        return this.items.length === 0
    }

    values(): T[] {
        return this.items
    }

    /*
     * Return the index at which the item can be inserted in order to maintain
     * the sort order of the array. If the item is in the array, it can be found
     * at the returned index.
     */
    private getItemIndex(item: T): number {
        if (!this.isEmpty()) {
            let first = 0
            let last = this.items.length
            while (first < last) {
                const middle = Math.floor((first + last) / 2)
                const comparison = this.compare(this.items[middle], item)
                if (comparison < 0) {
                    first = middle + 1
                } else {
                    last = middle
                }
            }
            return last
        } else {
            return 0
        }
    }
}
