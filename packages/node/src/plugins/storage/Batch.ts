import { EventEmitter } from 'events'
import { Logger, UserID } from '@streamr/utils'
import { v4 as uuidv4 } from 'uuid'
import { BucketId } from './Bucket'

export type BatchId = string
export type State = string
export type DoneCallback = (err?: Error) => void

export interface InsertRecord {
    streamId: string
    partition: number
    timestamp: number
    sequenceNo: number
    publisherId: UserID
    msgChainId: string
    payload: Buffer // cassandra-driver expects Buffer
}

export class Batch extends EventEmitter {
    // TODO convert to enum and rename to uppercase
    static states = Object.freeze({
        // OPENED => LOCKED => PENDING => INSERTED
        OPENED: 'opened', // opened for adding new messages
        LOCKED: 'locked', // locked for adding new messages, because isFull or timeout
        PENDING: 'pending', // awaiting to be inserted,
        INSERTED: 'inserted'
    })

    private id: BatchId
    private bucketId: BucketId
    logger: Logger
    private maxSize: number
    private maxRecordCount: number
    private maxRetries: number
    private closeTimeout: number
    private timeout: NodeJS.Timeout
    createdAt: number
    records: InsertRecord[]
    size: number
    retries: number
    state: State
    private doneCbs: DoneCallback[]

    constructor(bucketId: BucketId, maxSize: number, maxRecordCount: number, closeTimeout: number, maxRetries: number) {
        if (!bucketId?.length) {
            throw new TypeError('bucketId must be not empty string')
        }

        if (maxSize <= 0) {
            throw new TypeError('maxSize must be > 0')
        }

        if (maxRecordCount <= 0) {
            throw new TypeError('maxRecordCount must be > 0')
        }

        if (closeTimeout <= 0) {
            throw new TypeError('closeTimeout must be > 0')
        }

        if (maxRetries <= 0) {
            throw new TypeError('maxRetries must be > 0')
        }

        super()

        this.id = uuidv4()
        this.bucketId = bucketId
        this.createdAt = Date.now()
        this.records = []
        this.size = 0
        this.retries = 0
        this.state = Batch.states.OPENED
        this.doneCbs = []

        this.logger = new Logger(module, { id: this.id })

        this.maxSize = maxSize
        this.maxRecordCount = maxRecordCount
        this.maxRetries = maxRetries
        this.closeTimeout = closeTimeout

        this.timeout = setTimeout(() => {
            this.logger.trace('lock timeout')
            this.lock()
        }, this.closeTimeout)

        this.logger.trace('init new batch')
    }

    reachedMaxRetries(): boolean {
        return this.retries === this.maxRetries
    }

    getId(): string {
        return this.id
    }

    getBucketId(): string {
        return this.bucketId
    }

    lock(): void {
        clearTimeout(this.timeout)
        this.setState(Batch.states.LOCKED)
    }

    scheduleInsert(): void {
        clearTimeout(this.timeout)
        this.logger.trace('scheduleRetry', {
            retries: this.retries
        })

        this.timeout = setTimeout(() => {
            if (this.retries < this.maxRetries) {
                this.retries += 1
            }
            this.setState(Batch.states.PENDING)
        }, this.closeTimeout * this.retries)
    }

    done(): void {
        this.doneCbs.forEach((doneCb) => doneCb())
        this.doneCbs = []
    }

    clear(): void {
        this.logger.trace('clear')
        clearTimeout(this.timeout)
        this.records = []
        this.setState(Batch.states.INSERTED)
    }

    push(record: InsertRecord, doneCb?: DoneCallback): void {
        this.records.push(record)
        this.size += record.payload.length
        if (doneCb !== undefined) {
            this.doneCbs.push(doneCb)
        }
    }

    isFull(): boolean {
        return this.size >= this.maxSize || this.getRecordCount() >= this.maxRecordCount
    }

    private getRecordCount(): number {
        return this.records.length
    }

    private setState(state: State): void {
        this.state = state
        this.logger.trace('setState', { state })
        this.emit(this.state, this.getBucketId(), this.getId(), this.state, this.size, this.getRecordCount())
    }
}
