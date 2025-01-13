export class DuplicateDetector {
    private values: Set<string> = new Set()
    private queue: string[] = []
    private maxItemCount: number

    constructor(maxItemCount: number) {
        this.maxItemCount = maxItemCount
    }

    public add(value: string): void {
        this.values.add(value)
        this.queue.push(value)
        if (this.queue.length > this.maxItemCount) {
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
