import { EventEmitter } from 'events'
import { Logger } from 'pino'
import { Protocol } from 'streamr-network'
import { v4 as uuidv4 } from 'uuid'
import { getLogger } from '../helpers/logger'
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

    private _id: BatchId
    private _bucketId: BucketId
    logger: Logger
    private _maxSize: number
    private _maxRecords: number
    private _maxRetries: number
    private _closeTimeout: number
    private _timeout: NodeJS.Timeout
    createdAt: number
    streamMessages: Protocol.StreamMessage[]
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

        this._id = uuidv4()
        this._bucketId = bucketId
        this.createdAt = Date.now()
        this.streamMessages = []
        this.size = 0
        this.retries = 0
        this.state = Batch.states.OPENED
        this.doneCbs = []

        this.logger = getLogger(`streamr:storage:batch:${this.getId()}`)

        this._maxSize = maxSize
        this._maxRecords = maxRecords
        this._maxRetries = maxRetries
        this._closeTimeout = closeTimeout

        this._timeout = setTimeout(() => {
            this.logger.debug('lock timeout')
            this.lock()
        }, this._closeTimeout)

        this.logger.debug('init new batch')
    }

    reachedMaxRetries(): boolean {
        return this.retries === this._maxRetries
    }

    getId(): string {
        return this._id
    }

    getBucketId(): string {
        return this._bucketId
    }

    lock(): void {
        clearTimeout(this._timeout)
        this._setState(Batch.states.LOCKED)
    }

    scheduleInsert(): void {
        clearTimeout(this._timeout)
        this.logger.debug(`scheduleRetry. retries:${this.retries}`)

        this._timeout = setTimeout(() => {
            if (this.retries < this._maxRetries) {
                this.retries += 1
            }
            this._setState(Batch.states.PENDING)
        }, this._closeTimeout * this.retries)
    }

    done(): void {
        this.doneCbs.forEach((doneCb) => doneCb())
        this.doneCbs = []
    }

    clear(): void {
        this.logger.debug('cleared')
        clearTimeout(this._timeout)
        this.streamMessages = []
        this._setState(Batch.states.INSERTED)
    }

    push(streamMessage: Protocol.StreamMessage, doneCb?: DoneCallback): void {
        this.streamMessages.push(streamMessage)
        this.size += Buffer.byteLength(streamMessage.serialize())
        if (doneCb) {
            this.doneCbs.push(doneCb)
        }
    }

    isFull(): boolean {
        return this.size >= this._maxSize || this._getNumberOfMessages() >= this._maxRecords
    }

    private _getNumberOfMessages(): number {
        return this.streamMessages.length
    }

    _setState(state: State): void {
        this.state = state
        this.logger.debug(`emit state: ${this.state}`)
        this.emit(this.state, this.getBucketId(), this.getId(), this.state, this.size, this._getNumberOfMessages())
    }
}

