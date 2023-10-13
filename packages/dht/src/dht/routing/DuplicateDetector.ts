type QueueEntry = [timestamp: number, value: string]

export class DuplicateDetector {

    private values: Set<string> = new Set()
    private queue: Array<QueueEntry> = []
    private maxAge: number
    private maxNumberOfValues: number

    constructor(
        maxNumberOfValues: number,
        maxAgeInSeconds: number
    ) {
        this.maxNumberOfValues = maxNumberOfValues
        this.maxAge = maxAgeInSeconds * 1000
    }

    public add(value: string): void {
        this.values.add(value)
        this.queue.push([Date.now(), value])
        this.cleanUp()
    }

    public isMostLikelyDuplicate(value: string): boolean {
        return this.values.has(value)
    }

    private cleanUp(): void {
        const currentTime = Date.now()

        while (this.queue.length > 0 && (this.queue.length > this.maxNumberOfValues ||
            (currentTime - this.queue[0][0]) > this.maxAge)) {
            const oldestEntry = this.queue.shift()
            this.values.delete(oldestEntry![1])
        }
    }

    public size(): number {
        return this.values.size
    }

    public clear(): void {
        this.values.clear()
        this.queue = []
    }
}
