const EventEmitter = require('eventemitter3')
const debug = require('debug')('StreamrClient::Subscription')

const protocol = require('./Protocol')

let subId = 0
function generateSubscriptionId() {
    const id = subId
    subId += 1
    return id.toString()
}

module.exports = class Subscription extends EventEmitter {
    static get State() {
        return {
            unsubscribed: 'unsubscribed',
            subscribing: 'subscribing',
            subscribed: 'subscribed',
            unsubscribing: 'unsubscribing',
        }
    }

    constructor(streamId, streamPartition, apiKey, callback, options) {
        super()

        if (!streamId) {
            throw new Error('No stream id given!')
        }
        if (!callback) {
            throw new Error('No callback given!')
        }

        this.id = generateSubscriptionId()
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.apiKey = apiKey
        this.callback = callback
        this.options = options || {}
        this.queue = []
        this.state = Subscription.State.unsubscribed
        this.resending = false
        this.lastReceivedOffset = null

        // Check that multiple resend options are not given
        let resendOptionCount = 0
        if (this.options.resend_all) {
            resendOptionCount += 1
        }
        if (this.options.resend_from != null) {
            resendOptionCount += 1
        }
        if (this.options.resend_last != null) {
            resendOptionCount += 1
        }
        if (this.options.resend_from_time != null) {
            resendOptionCount += 1
        }
        if (resendOptionCount > 1) {
            throw new Error(`Multiple resend options active! Please use only one: ${JSON.stringify(options)}`)
        }

        // Automatically convert Date objects to numbers for resend_from_time
        if (this.options.resend_from_time != null
            && typeof this.options.resend_from_time !== 'number') {
            if (typeof this.options.resend_from_time.getTime === 'function') {
                this.options.resend_from_time = this.options.resend_from_time.getTime()
            } else {
                throw new Error('resend_from_time option must be a Date object or a number representing time!')
            }
        }

        /** * Message handlers ** */

        this.on('unsubscribed', () => {
            this.setResending(false)
        })

        this.on('no_resend', (response) => {
            debug('Sub %s no_resend: %o', this.id, response)
            this.setResending(false)
            this.checkQueue()
        })

        this.on('resent', (response) => {
            debug('Sub %s resent: %o', this.id, response)
            this.setResending(false)
            this.checkQueue()
        })

        this.on('connected', () => {

        })

        this.on('disconnected', () => {
            this.setState(Subscription.State.unsubscribed)
            this.setResending(false)
        })
    }

    /**
     * Gap check: If the msg contains the previousOffset, and we know the lastReceivedOffset,
     * and the previousOffset is larger than what has been received, we have a gap!
     */
    checkForGap(msg) {
        return msg.previousOffset != null &&
            this.lastReceivedOffset != null &&
            msg.previousOffset > this.lastReceivedOffset
    }

    handleMessage(msg, isResend) {
        if (msg.previousOffset == null) {
            debug('handleMessage: prevOffset is null, gap detection is impossible! message: %o', msg)
        }

        // TODO: check this.options.resend_last ?
        // If resending, queue broadcasted messages
        if (this.resending && !isResend) {
            this.queue.push(msg)
        } else if (this.checkForGap(msg) && !this.resending) {
            // Queue the message to be processed after resend
            this.queue.push(msg)

            const from = this.lastReceivedOffset + 1
            const to = msg.previousOffset
            debug('Gap detected, requesting resend for stream %s from %d to %d', this.streamId, from, to)
            this.emit('gap', from, to)
        } else if (this.lastReceivedOffset != null && msg.offset <= this.lastReceivedOffset) {
            // Prevent double-processing of messages for any reason
            debug('Sub %s already received message: %d, lastReceivedOffset: %d. Ignoring message.', this.id, msg.offset, this.lastReceivedOffset)
        } else {
            // Normal case where prevOffset == null || lastReceivedOffset == null || prevOffset === lastReceivedOffset
            this.lastReceivedOffset = msg.offset
            this.callback(msg.content, msg)
            if (protocol.isByeMessage(msg.content)) {
                this.emit('done')
            }
        }
    }

    checkQueue() {
        if (this.queue.length) {
            debug('Attempting to process %d queued messages for stream %s', this.queue.length, this.streamId)

            const originalQueue = this.queue
            this.queue = []

            originalQueue.forEach((msg) => this.handleMessage(msg, false))
        }
    }

    hasResendOptions() {
        return this.options.resend_all === true || this.options.resend_from >= 0 || this.options.resend_from_time >= 0 || this.options.resend_last > 0
    }

    /**
     * Resend needs can change if messages have already been received.
     * This function always returns the effective resend options:
     *
     * If messages have been received:
     * - resend_all becomes resend_from
     * - resend_from becomes resend_from the latest received message
     * - resend_from_time becomes resend_from the latest received message
     * - resend_last stays the same
     */
    getEffectiveResendOptions() {
        if (this.hasReceivedMessages() && this.hasResendOptions()) {
            if (this.options.resend_all || this.options.resend_from || this.options.resend_from_time) {
                return {
                    resend_from: this.lastReceivedOffset + 1,
                }
            } else if (this.options.resend_last) {
                return this.options
            }
        }

        return this.options
    }

    hasReceivedMessages() {
        return this.lastReceivedOffset != null
    }

    getState() {
        return this.state
    }

    setState(state) {
        debug(`Subscription: Stream ${this.streamId} state changed ${this.state} => ${state}`)
        this.state = state
        this.emit(state)
    }

    isResending() {
        return this.resending
    }

    setResending(resending) {
        debug(`Subscription: Stream ${this.streamId} resending: ${resending}`)
        this.resending = resending
    }
}
