const createDebug = require('debug')

class Bucket {
    constructor(id, streamId, partition, size, records, dateCreate, maxSize, maxRecords, keepAliveSeconds) {
        if (!id || !id.length) {
            throw new TypeError('id must be not empty string')
        }

        if (!streamId || !streamId.length) {
            throw new TypeError('streamId must be not empty string')
        }

        if (!Number.isInteger(partition) || parseInt(partition) < 0) {
            throw new TypeError('partition must be >= 0')
        }

        if (!Number.isInteger(size) || parseInt(size) < 0) {
            throw new TypeError('size must be => 0')
        }

        if (!Number.isInteger(records) || parseInt(records) < 0) {
            throw new TypeError('records must be => 0')
        }

        if (!(dateCreate instanceof Date)) {
            throw new TypeError('dateCreate must be instance of Date')
        }

        if (!Number.isInteger(maxSize) || parseInt(maxSize) <= 0) {
            throw new TypeError('maxSize must be > 0')
        }

        if (!Number.isInteger(maxRecords) || parseInt(maxRecords) <= 0) {
            throw new TypeError('maxRecords must be > 0')
        }

        if (!Number.isInteger(keepAliveSeconds) || parseInt(keepAliveSeconds) <= 0) {
            throw new Error('keepAliveSeconds must be > 0')
        }

        this.id = id
        this.streamId = streamId
        this.partition = partition
        this.size = size
        this.records = records
        this.dateCreate = dateCreate

        this.debug = createDebug(`streamr:storage:bucket:${this.id}`)
        this.debug(`init bucket: ${this.getId()}, dateCreate: ${this.dateCreate}`)

        this._maxSize = maxSize
        this._maxRecords = maxRecords
        this._keepAliveSeconds = keepAliveSeconds

        this.ttl = new Date()
        this._stored = false
        this._updateTTL()
    }

    isStored() {
        return this._stored
    }

    setStored() {
        this._stored = true
    }

    _checkSize(percentDeduction = 0) {
        const maxPercentSize = (this._maxSize * (100 - percentDeduction)) / 100
        const maxRecords = (this._maxRecords * (100 - percentDeduction)) / 100
        this.debug(`_checkSize: ${this.size >= maxPercentSize || this.records >= maxRecords} => ${this.size} >= ${maxPercentSize} || ${this.records} >= ${maxRecords}`)

        return this.size >= maxPercentSize || this.records >= maxRecords
    }

    isAlmostFull(percentDeduction = 30) {
        return this._checkSize(percentDeduction)
    }

    getId() {
        return this.id
    }

    incrementBucket(size) {
        this.size += size
        this.records += 1

        this.debug(`incremented bucket => size: ${this.size}, records: ${this.records}`)

        this._stored = false
        this._updateTTL()
    }

    _updateTTL() {
        this.ttl = new Date()
        this.ttl.setSeconds(this.ttl.getSeconds() + this._keepAliveSeconds)
        this.debug(`new ttl: ${this.ttl}`)
    }

    isAlive() {
        const isAlive = this.ttl >= new Date()
        this.debug(`isAlive: ${isAlive}, ${this.ttl} >= ${new Date()}`)
        return this.ttl >= new Date()
    }
}

module.exports = Bucket
