import { EventEmitter } from 'events'
import { Logger } from '@streamr/utils'
import type { StreamMessage } from 'streamr-client-protocol'
import { v4 as uuidv4 } from 'uuid'
import { BucketId } from './Bucket'

export type BatchId = string
export type State = string
export type DoneCallback = (err?: Error) => void

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
    private maxRecords: number
    private maxRetries: number
    private closeTimeout: number
    private timeout: NodeJS.Timeout
    createdAt: number
    streamMessages: StreamMessage[]
    size: number
    retries: number
    state: State
    private doneCbs: DoneCallback[]

    constructor(bucketId: BucketId, maxSize: number, maxRecords: number, closeTimeout: number, maxRetries: number) {
        if (!bucketId || !bucketId.length) {
            throw new TypeError('bucketId must be not empty string')
        }

        if (maxSize <= 0) {
            throw new TypeError('maxSize must be > 0')
        }

        if (maxRecords <= 0) {
            throw new TypeError('maxRecords must be > 0')
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
        this.streamMessages = []
        this.size = 0
        this.retries = 0
        this.state = Batch.states.OPENED
        this.doneCbs = []

        this.logger = new Logger(module, `${this.getId()}`)

        this.maxSize = maxSize
        this.maxRecords = maxRecords
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
        this.logger.trace(`scheduleRetry. retries:${this.retries}`)

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
        this.logger.trace('cleared')
        clearTimeout(this.timeout)
        this.streamMessages = []
        this.setState(Batch.states.INSERTED)
    }

    push(streamMessage: StreamMessage, doneCb?: DoneCallback): void {
        this.streamMessages.push(streamMessage)
        this.size += Buffer.byteLength(streamMessage.serialize())
        if (doneCb) {
            this.doneCbs.push(doneCb)
        }
    }

    isFull(): boolean {
        return this.size >= this.maxSize || this.getNumberOfMessages() >= this.maxRecords
    }

    private getNumberOfMessages(): number {
        return this.streamMessages.length
    }

    private setState(state: State): void {
        this.state = state
        this.logger.trace(`emit state: ${this.state}`)
        this.emit(this.state, this.getBucketId(), this.getId(), this.state, this.size, this.getNumberOfMessages())
    }
}

