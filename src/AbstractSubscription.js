import debugFactory from 'debug'
import { Errors, Utils } from 'streamr-client-protocol'

import VerificationFailedError from './errors/VerificationFailedError'
import InvalidSignatureError from './errors/InvalidSignatureError'
import EncryptionUtil from './EncryptionUtil'
import Subscription from './Subscription'

const { OrderingUtil } = Utils
const debug = debugFactory('StreamrClient::AbstractSubscription')

export default class AbstractSubscription extends Subscription {
    constructor(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout, orderMessages = true) {
        super(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout)
        this.callback = callback
        this.orderingUtil = (orderMessages) ? new OrderingUtil(streamId, streamPartition, (orderedMessage) => {
            this._handleInOrder(orderedMessage)
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

        this.on('error', () => {
            this._clearGaps()
        })
    }

    _handleInOrder(orderedMessage) {
        const newGroupKey = EncryptionUtil.decryptStreamMessage(orderedMessage, this.groupKeys[orderedMessage.getPublisherId()])
        if (newGroupKey) {
            this.groupKeys[orderedMessage.getPublisherId()] = newGroupKey
        }
        this.callback(orderedMessage.getParsedContent(), orderedMessage)
        if (orderedMessage.isByeMessage()) {
            this.emit('done')
        }
    }

    async handleResentMessage(msg, verifyFn) {
        return this._catchAndEmitErrors(() => {
            if (!this.isResending()) {
                throw new Error(`There is no resend in progress, but received resent message ${msg.serialize()}`)
            } else {
                const handleMessagePromise = this._handleMessage(msg, verifyFn)
                this._lastMessageHandlerPromise = handleMessagePromise
                return handleMessagePromise
            }
        })
    }

    async handleResending(response) {
        return this._catchAndEmitErrors(() => {
            if (!this.isResending()) {
                throw new Error(`There should be no resend in progress, but received ResendResponseResending message ${response.serialize()}`)
            }
            this.emit('resending', response)
        })
    }

    async handleResent(response) {
        return this._catchAndEmitErrors(async () => {
            if (!this.isResending()) {
                throw new Error(`There should be no resend in progress, but received ResendResponseResent message ${response.serialize()}`)
            }

            if (!this._lastMessageHandlerPromise) {
                throw new Error('Attempting to handle ResendResponseResent, but no messages have been received!')
            }

            // Delay event emission until the last message in the resend has been handled
            await this._lastMessageHandlerPromise
            try {
                this.emit('resent', response)
            } finally {
                this._finishResend()
            }
        })
    }

    async handleNoResend(response) {
        return this._catchAndEmitErrors(async () => {
            if (!this.isResending()) {
                throw new Error(`There should be no resend in progress, but received ResendResponseNoResend message ${response.serialize()}`)
            }
            try {
                this.emit('no_resend', response)
            } finally {
                this._finishResend(true)
            }
        })
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
        debug(`Subscription: Stream ${this.streamId} state changed ${this.state} => ${state}`)
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
            console.error(err)
            this.emit('error', err)
            // Swallow rejection
            return Promise.resolve()
        }
    }

    static async validate(msg, verifyFn) {
        // Make sure the verification is successful before proceeding
        let valid
        try {
            valid = await verifyFn()
        } catch (cause) {
            throw new VerificationFailedError(msg, cause)
        }

        if (!valid) {
            throw new InvalidSignatureError(msg)
        }
    }

    async _handleMessage(msg, verifyFn) {
        await AbstractSubscription.validate(msg, verifyFn)
        this.emit('message received')
        if (this.orderingUtil) {
            this.orderingUtil.add(msg)
        } else {
            this._handleInOrder(msg)
        }
    }
}
