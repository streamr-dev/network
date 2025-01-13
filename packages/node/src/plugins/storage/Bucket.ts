export type BucketId = string

export class Bucket {
    id: BucketId
    streamId: string
    partition: number
    size: number
    records: number
    dateCreate: Date
    private maxSize: number
    private maxRecordCount: number
    private keepAliveSeconds: number
    ttl: Date
    private stored: boolean

    constructor(
        id: BucketId,
        streamId: string,
        partition: number,
        size: number,
        records: number,
        dateCreate: Date,
        maxSize: number,
        maxRecordCount: number,
        keepAliveSeconds: number
    ) {
        if (!id?.length) {
            throw new TypeError('id must be not empty string')
        }

        if (!streamId?.length) {
            throw new TypeError('streamId must be not empty string')
        }

        if (partition < 0) {
            throw new TypeError('partition must be >= 0')
        }

        if (size < 0) {
            throw new TypeError('size must be => 0')
        }

        if (records < 0) {
            throw new TypeError('records must be => 0')
        }

        if (!(dateCreate instanceof Date)) {
            throw new TypeError('dateCreate must be instance of Date')
        }

        if (maxSize <= 0) {
            throw new TypeError('maxSize must be > 0')
        }

        if (maxRecordCount <= 0) {
            throw new TypeError('maxRecordCount must be > 0')
        }

        if (keepAliveSeconds <= 0) {
            throw new Error('keepAliveSeconds must be > 0')
        }

        this.id = id
        this.streamId = streamId
        this.partition = partition
        this.size = size
        this.records = records
        this.dateCreate = dateCreate

        this.maxSize = maxSize
        this.maxRecordCount = maxRecordCount
        this.keepAliveSeconds = keepAliveSeconds

        this.ttl = new Date()
        this.stored = false
        this.updateTTL()
    }

    isStored(): boolean {
        return this.stored
    }

    setStored(): void {
        this.stored = true
    }

    private checkSize(percentDeduction = 0): boolean {
        const maxPercentSize = (this.maxSize * (100 - percentDeduction)) / 100
        const maxRecordCount = (this.maxRecordCount * (100 - percentDeduction)) / 100
        return this.size >= maxPercentSize || this.records >= maxRecordCount
    }

    isAlmostFull(percentDeduction = 30): boolean {
        return this.checkSize(percentDeduction)
    }

    getId(): string {
        return this.id
    }

    incrementBucket(size: number): void {
        this.size += size
        this.records += 1
        this.stored = false
        this.updateTTL()
    }

    private updateTTL(): void {
        this.ttl = new Date()
        this.ttl.setSeconds(this.ttl.getSeconds() + this.keepAliveSeconds)
    }

    isAlive(): boolean {
        const now = new Date()
        return this.ttl >= now
    }
}
