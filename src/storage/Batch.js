const EventEmitter = require('events')

const { v4: uuidv4 } = require('uuid')

const getLogger = require('../helpers/logger')

const STATES = Object.freeze({
    // OPENED => LOCKED => PENDING => INSERTED
    OPENED: 'opened', // opened for adding new messages
    LOCKED: 'locked', // locked for adding new messages, because isFull or timeout
    PENDING: 'pending', // awaiting to be inserted,
    INSERTED: 'inserted'
})

class Batch extends EventEmitter {
    constructor(bucketId, maxSize, maxRecords, closeTimeout, maxRetries) {
        if (!bucketId || !bucketId.length) {
            throw new TypeError('bucketId must be not empty string')
        }

        if (!Number.isInteger(maxSize) || parseInt(maxSize) <= 0) {
            throw new TypeError('maxSize must be > 0')
        }

        if (!Number.isInteger(maxRecords) || parseInt(maxRecords) <= 0) {
            throw new TypeError('maxRecords must be > 0')
        }

        if (!Number.isInteger(closeTimeout) || parseInt(closeTimeout) <= 0) {
            throw new TypeError('closeTimeout must be > 0')
        }

        if (!Number.isInteger(maxRetries) || parseInt(maxRetries) <= 0) {
            throw new TypeError('maxRetries must be > 0')
        }

        super()

        this._id = uuidv4()
        this._bucketId = bucketId
        this.createdAt = Date.now()
        this.streamMessages = []
        this.size = 0
        this.retries = 0
        this.state = STATES.OPENED
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

    reachedMaxRetries() {
        return this.retries === this._maxRetries
    }

    getId() {
        return this._id
    }

    getBucketId() {
        return this._bucketId
    }

    lock() {
        clearTimeout(this._timeout)
        this._setState(STATES.LOCKED)
    }

    scheduleInsert() {
        clearTimeout(this._timeout)
        this.logger.debug(`scheduleRetry. retries:${this.retries}`)

        this._timeout = setTimeout(() => {
            if (this.retries < this._maxRetries) {
                this.retries += 1
            }
            this._setState(STATES.PENDING)
        }, this._closeTimeout * this.retries)
    }

    done() {
        this.doneCbs.forEach((doneCb) => doneCb())
        this.doneCbs = []
    }

    clear() {
        this.logger.debug('cleared')
        clearTimeout(this._timeout)
        this.streamMessages = []
        this._setState(STATES.INSERTED)
    }

    push(streamMessage, doneCb) {
        this.streamMessages.push(streamMessage)
        this.size += Buffer.from(streamMessage.serialize()).length
        if (doneCb) {
            this.doneCbs.push(doneCb)
        }
    }

    isFull() {
        return this.size >= this._maxSize || this._getNumberOrMessages() >= this._maxRecords
    }

    _getNumberOrMessages() {
        return this.streamMessages.length
    }

    _setState(state) {
        this.state = state
        this.logger.debug(`emit state: ${this.state}`)
        this.emit(this.state, this.getBucketId(), this.getId(), this.state, this.size, this._getNumberOrMessages())
    }
}

Batch.states = STATES

module.exports = Batch
