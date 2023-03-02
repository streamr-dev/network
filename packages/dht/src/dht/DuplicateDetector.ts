import { Message } from "../proto/packages/dht/protos/DhtRpc"

type QueueEntry = [timeStamp: number, value: string, senderId: string, message?: Message]

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

    public add(value: string, senderId: string, message?: Message): void {
        this.values.add(value)
        if (message) {
            this.queue.push([Date.now(), value, senderId, message])
        } else {
            this.queue.push([Date.now(), value, senderId])
        }
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

}
