import { Errors, Utils } from 'streamr-client-protocol'

import Subscription from './Subscription'
import UnableToDecryptError from './errors/UnableToDecryptError'

const { OrderingUtil } = Utils

const MAX_NB_GROUP_KEY_REQUESTS = 10

function decryptErrorToDisplay(error) {
    const ciphertext = error.streamMessage.getSerializedContent()
    return ciphertext.length > 100 ? `${ciphertext.slice(0, 100)}...` : ciphertext
}

export default class AbstractSubscription extends Subscription {
    constructor({
        streamId,
        streamPartition,
        callback,
        groupKeys,
        onUnableToDecrypt,
        propagationTimeout,
        resendTimeout,
        orderMessages = true,
        debug,
    }) {
        super({
            streamId,
            streamPartition,
            callback,
            groupKeys,
            propagationTimeout,
            resendTimeout,
            debug,
        })
        this.callback = callback
        this.pendingResendRequestIds = {}
        this._lastMessageHandlerPromise = {}
        if (onUnableToDecrypt) {
            this.onUnableToDecrypt = onUnableToDecrypt
        }
        this.onUnableToDecrypt = this.onUnableToDecrypt.bind(this)
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

        this.encryptedMsgsQueues = {}
        this.waitingForGroupKey = {}
        this.nbGroupKeyRequests = {}
    }

    /**
     * Override to control output
     */

    onError(error) { // eslint-disable-line class-methods-use-this
        console.error(error)
    }

    // eslint-disable-next-line class-methods-use-this
    onUnableToDecrypt(error) {
        this.debug(`WARN: Unable to decrypt: ${decryptErrorToDisplay(error)}`)
    }

    _addMsgToQueue(encryptedMsg) {
        const publisherId = encryptedMsg.getPublisherId().toLowerCase()
        if (!this.encryptedMsgsQueues[publisherId]) {
            this.encryptedMsgsQueues[publisherId] = []
        }
        this.encryptedMsgsQueues[publisherId].push(encryptedMsg)
    }

    _emptyMsgQueues() {
        const queues = Object.values(this.encryptedMsgsQueues)
        for (let i = 0; i < queues.length; i++) {
            if (queues[i].length > 0) {
                return false
            }
        }
        return true
    }

    _inOrderHandler(orderedMessage) {
        return this._catchAndEmitErrors(() => {
            if (!this.waitingForGroupKey[orderedMessage.getPublisherId().toLowerCase()]) {
                this._decryptAndHandle(orderedMessage)
            } else {
                this._addMsgToQueue(orderedMessage)
            }
        })
    }

    _decryptAndHandle(orderedMessage) {
        let success
        try {
            success = this._decryptOrRequestGroupKey(orderedMessage, orderedMessage.getPublisherId().toLowerCase())
        } catch (err) {
            if (err instanceof UnableToDecryptError) {
                this.onUnableToDecrypt(err)
            } else {
                throw err
            }
        }
        if (success) {
            this.callback(orderedMessage.getParsedContent(), orderedMessage)
            if (orderedMessage.isByeMessage()) {
                this.emit('done')
            }
        } else {
            this.debug('Failed to decrypt. Requested the correct decryption key(s) and going to try again.')
        }
    }

    _requestGroupKeyAndQueueMessage(msg, start, end) {
        this.emit('groupKeyMissing', msg.getPublisherId(), start, end)
        const publisherId = msg.getPublisherId().toLowerCase()
        this.nbGroupKeyRequests[publisherId] = 1 // reset retry counter
        clearInterval(this.waitingForGroupKey[publisherId])
        this.waitingForGroupKey[publisherId] = setInterval(() => {
            if (this.nbGroupKeyRequests[publisherId] < MAX_NB_GROUP_KEY_REQUESTS) {
                this.nbGroupKeyRequests[publisherId] += 1
                this.emit('groupKeyMissing', msg.getPublisherId(), start, end)
            } else {
                this.debug(`WARN: Failed to receive group key response from ${publisherId} after ${MAX_NB_GROUP_KEY_REQUESTS} requests.`)
                this._cancelGroupKeyRequest(publisherId)
            }
        }, this.propagationTimeout)
        this._addMsgToQueue(msg)
    }

    _handleEncryptedQueuedMsgs(publisherId) {
        this._cancelGroupKeyRequest(publisherId.toLowerCase())
        const queue = this.encryptedMsgsQueues[publisherId.toLowerCase()]
        while (queue.length > 0) {
            this._decryptAndHandle(queue.shift())
        }
    }

    _cancelGroupKeyRequest(publisherId) {
        clearInterval(this.waitingForGroupKey[publisherId])
        this.waitingForGroupKey[publisherId] = undefined
        delete this.waitingForGroupKey[publisherId]
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
        Object.keys(this.waitingForGroupKey).forEach((publisherId) => this._cancelGroupKeyRequest(publisherId))
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

AbstractSubscription.defaultUnableToDecrypt = AbstractSubscription.prototype.defaultUnableToDecrypt
AbstractSubscription.MAX_NB_GROUP_KEY_REQUESTS = MAX_NB_GROUP_KEY_REQUESTS
