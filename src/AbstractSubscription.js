import { Errors, Utils } from 'streamr-client-protocol'

import Subscription from './Subscription'

const { OrderingUtil } = Utils

export default class AbstractSubscription extends Subscription {
    constructor({
        streamId,
        streamPartition,
        callback,
        propagationTimeout,
        resendTimeout,
        orderMessages = true,
        debug,
    }) {
        super({
            streamId,
            streamPartition,
            callback,
            propagationTimeout,
            resendTimeout,
            debug,
        })
        this.pendingResendRequestIds = {}
        this._lastMessageHandlerPromise = {}
        this.orderingUtil = (orderMessages) ? new OrderingUtil(streamId, streamPartition, (orderedMessage) => {
            this._inOrderHandler(orderedMessage)
        }, (from, to, publisherId, msgChainId) => {
            this.emit('gap', from, to, publisherId, msgChainId)
        }, this.propagationTimeout, this.resendTimeout) : undefined

        /** * Message handlers ** */

        this.on('unsubscribed', () => {
            this._clearGaps()
            this.setResending(false)
        })

        this.on('disconnected', () => {
            this.setState(Subscription.State.unsubscribed)
            this._clearGaps()
            this.setResending(false)
        })

        this.on('error', (error) => {
            this._clearGaps()
            this.onError(error)
        })
    }

    /**
     * Override to control output
     */

    onError(error) { // eslint-disable-line class-methods-use-this
        console.error(error)
    }

    _inOrderHandler(orderedMessage) {
        this.callback(orderedMessage.getParsedContent(), orderedMessage)
        if (orderedMessage.isByeMessage()) {
            this.emit('done')
        }
    }

    addPendingResendRequestId(requestId) {
        this.pendingResendRequestIds[requestId] = true
    }

    async handleResentMessage(msg, requestId, verifyFn) {
        this._lastMessageHandlerPromise[requestId] = this._catchAndEmitErrors(async () => {
            if (!this.isResending()) {
                throw new Error(`There is no resend in progress, but received resent message ${msg.serialize()}`)
            } else {
                await this._handleMessage(msg, verifyFn)
            }
        })
        return this._lastMessageHandlerPromise[requestId]
    }

    async handleResending(response) {
        return this._catchAndEmitErrors(() => {
            if (!this.pendingResendRequestIds[response.requestId]) {
                throw new Error(`Received unexpected ResendResponseResending message ${response.serialize()}`)
            }
            this.emit('resending', response)
        })
    }

    async handleResent(response) {
        return this._catchAndEmitErrors(async () => {
            if (!this.pendingResendRequestIds[response.requestId]) {
                throw new Error(`Received unexpected ResendResponseResent message ${response.serialize()}`)
            }

            if (!this._lastMessageHandlerPromise[response.requestId]) {
                throw new Error('Attempting to handle ResendResponseResent, but no messages have been received!')
            }

            // Delay event emission until the last message in the resend has been handled
            await this._lastMessageHandlerPromise[response.requestId]
            try {
                this.emit('resent', response)
            } finally {
                this.cleanupResponse(response)
            }
        })
    }

    async handleNoResend(response) {
        return this._catchAndEmitErrors(async () => {
            if (!this.pendingResendRequestIds[response.requestId]) {
                throw new Error(`Received unexpected ResendResponseNoResend message ${response.serialize()}`)
            }
            try {
                this.emit('no_resend', response)
            } finally {
                this.cleanupResponse(response)
            }
        })
    }

    cleanupResponse(response) {
        delete this.pendingResendRequestIds[response.requestId]
        delete this._lastMessageHandlerPromise[response.requestId]
        if (Object.keys(this.pendingResendRequestIds).length === 0) {
            this.finishResend()
        }
    }

    _clearGaps() {
        if (this.orderingUtil) {
            this.orderingUtil.clearGaps()
        }
    }

    stop() {
        this._clearGaps()
    }

    getState() {
        return this.state
    }

    setState(state) {
        this.debug(`Subscription: Stream ${this.streamId} state changed ${this.state} => ${state}`)
        this.state = state
        this.emit(state)
    }

    handleError(err) {
        /**
         * If parsing the (expected) message failed, we should still mark it as received. Otherwise the
         * gap detection will think a message was lost, and re-request the failing message.
         */
        if (err instanceof Errors.InvalidJsonError && err.streamMessage && this.orderingUtil) {
            this.orderingUtil.markMessageExplicitly(err.streamMessage)
        }
        this.emit('error', err)
    }

    async _catchAndEmitErrors(fn) {
        try {
            return await fn()
        } catch (err) {
            this.emit('error', err)
            // Swallow rejection
            return Promise.resolve()
        }
    }

    /**
     * Ensures validations resolve in order that they were triggered
     */

    async _queuedValidate(msg, verifyFn) {
        // wait for previous validation (if any)
        const queue = Promise.all([
            this.validationQueue,
            // kick off job in parallel
            verifyFn(msg),
        ]).then((value) => {
            this.validationQueue = null // clean up (allow gc)
            return value
        }, (err) => {
            this.validationQueue = null // clean up (allow gc)
            throw err
        })
        this.validationQueue = queue
        return queue
    }

    async _handleMessage(msg, verifyFn) {
        await this._queuedValidate(msg, verifyFn)
        this.emit('message received')
        if (this.orderingUtil) {
            this.orderingUtil.add(msg)
        } else {
            this._inOrderHandler(msg)
        }
    }
}
