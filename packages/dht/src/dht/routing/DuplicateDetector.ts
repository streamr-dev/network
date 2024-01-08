export class DuplicateDetector {

    private values: Set<string> = new Set()
    private queue: Array<string> = []
    private maxNumberOfValues: number

    constructor(
        maxNumberOfValues: number,
    ) {
        this.maxNumberOfValues = maxNumberOfValues
    }

    public add(value: string): void {
        this.values.add(value)
        this.queue.push(value)
        if (this.queue.length > this.maxNumberOfValues) {
            const removed = this.queue.shift()!
            this.values.delete(removed)
        }
    }

    public isMostLikelyDuplicate(value: string): boolean {
        return this.values.has(value)
    }

    public size(): number {
        return this.values.size
    }

    public clear(): void {
        this.values.clear()
        this.queue = []
    }
}
