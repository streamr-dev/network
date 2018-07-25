const debug = require('debug')('MessageCache')
const debugMessages = require('debug')('MessageCache:messages')

const constants = require('./constants')

module.exports = class MessageCache {
    constructor(streamId, minSize, hardMax, hintTimeout, resender) {
        this.streamId = streamId
        this.minSize = (minSize === undefined ? 0 : minSize)
        this.hardMax = (hardMax === undefined ? 100 : hardMax)
        this.messages = []
        this.hintTimeout = (hintTimeout === undefined ? 60 * 1000 : hintTimeout)
        this.hintTimeouts = {}

        // Start at minimum size
        this.setMaxSize(this.minSize)

        this.resender = resender
    }

    add(msg) {
        if (this.maxSize > 0) {
            // Ensure no gaps
            const lastMsgCounter = msg[constants.COUNTER_KEY]
            const expectedCounter = lastMsgCounter - 1
            const actualCounter = this.messages.length > 0 ? this.messages[this.messages.length - 1][constants.COUNTER_KEY] : -1

            if (this.messages.length === 0 || actualCounter === expectedCounter) {
                this.messages.push(msg)
                this.compact()
                debugMessages('add: %o', msg)
            } else if (this.messages.length > 0 && actualCounter < expectedCounter && !this.resending) {
                debug(
                    'Oh, no! Cache detected a gap in counters for stream %s! Latest in cache: %d, new message: %d.',
                    this.streamId, actualCounter, lastMsgCounter,
                )
                this.resending = true
                this.resender.resend(
                    this.streamId,
                    actualCounter + 1, // from counter
                    lastMsgCounter, // to counter
                    (resentMessage) => { // handler
                        this.add(resentMessage)
                    },
                    () => { // finish callback
                        this.resending = false
                    },
                )
            } else {
                // ignore old messages
            }
        }
    }

    compact() {
        // Optimize the case when we are rolling and there is just one extra msg
        if (this.messages.length === this.maxSize + 1) {
            this.messages.shift()
        } else if (this.messages.length > this.maxSize) {
            // Larger compaction on eg. max size change
            this.messages.splice(0, this.messages.length - this.maxSize)
        }
    }

    getLast(count) {
        this.hint(count)

        if (count > this.messages.length) {
            debug('getLast: Cache MISS for %s, count: %d', this.streamId, count)
            return null
        }
        debug('getLast: Cache HIT for %s, count: %d', this.streamId, count)
        return this.messages.slice(-1 * count)
    }

    getRange(from, to = (this.messages.length > 0 ? this.messages[this.messages.length - 1][constants.COUNTER_KEY] : -1)) {
        if (to < from) {
            return null
        }

        const count = (to - from) + 1
        this.hint(count)

        if (this.messages.length >= count
            && this.messages[this.messages.length - 1][constants.COUNTER_KEY] >= to
            && this.messages[0][constants.COUNTER_KEY] <= from) {
            debug('getRange: Cache HIT for %s, range: %d to %d', this.streamId, from, to)
            return this.messages.slice(from - this.messages[0][constants.COUNTER_KEY], (to - this.messages[0][constants.COUNTER_KEY]) + 1)
        }
        debug('getRange: Cache MISS for %s, range: %d to %d', this.streamId, from, to)
        return null
    }

    hint(size) {
        // Hint can only grow the maxSize
        if (size > this.maxSize) {
            this.setMaxSize(size)
            debug('hint: Cache size for %s grown to %d', this.streamId, this.maxSize)
        }

        if (size >= this.maxSize) {
            const checkCurrent = () => {
                if (this.nextHint !== undefined) {
                    debug(
                        'hint: Current size expired for %s, resising from %d to next-largest size %d',
                        this.streamId,
                        this.maxSize,
                        this.nextHint,
                    )
                    this.setMaxSize(this.nextHint)

                    // New timeout for next step
                    this.setHintTimeout('curr', checkCurrent)
                } else {
                    debug('hint: Current size expired for %s, resising from %d to minimum size %d', this.streamId, this.maxSize, this.minSize)
                    this.setMaxSize(this.minSize)
                    // No new timeout, since at minSize
                }
            }
            this.setHintTimeout('curr', checkCurrent)
        } else if (!this.nextHint || size >= this.nextHint) {
            this.nextHint = size

            this.setHintTimeout('next', () => {
                debug('hint: Next-largest size expired for %s, was %d (current size is %d)', this.streamId, this.nextHint, this.maxSize)
                delete this.nextHint
            })
        }
    }

    setHintTimeout(id, cb) {
        // Clear existing timeout
        if (this.hintTimeouts[id]) {
            clearTimeout(this.hintTimeouts[id])
        }

        // Timeout will shrink the maxSize
        this.hintTimeouts[id] = setTimeout(cb, this.hintTimeout)
    }

    setMaxSize(maxSize) {
        const oldMaxSize = this.maxSize
        this.maxSize = Math.min(maxSize, this.hardMax)

        if (this.maxSize < oldMaxSize) {
            this.compact()
        }
    }

    size() {
        return this.messages.length
    }
}

