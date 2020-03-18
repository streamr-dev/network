import debugFactory from 'debug'
import { Errors, Utils } from 'streamr-client-protocol'

import VerificationFailedError from './errors/VerificationFailedError'
import InvalidSignatureError from './errors/InvalidSignatureError'
import Subscription from './Subscription'
import UnableToDecryptError from './errors/UnableToDecryptError'

const { OrderingUtil } = Utils
const debug = debugFactory('StreamrClient::AbstractSubscription')

const defaultUnableToDecrypt = (error) => {
    const ciphertext = error.streamMessage.getSerializedContent()
    const toDisplay = ciphertext.length > 100 ? `${ciphertext.slice(0, 100)}...` : ciphertext
    console.warn(`Unable to decrypt: ${toDisplay}`)
}

const MAX_NB_GROUP_KEY_REQUESTS = 10

export default class AbstractSubscription extends Subscription {
    constructor(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout, orderMessages = true,
        onUnableToDecrypt = defaultUnableToDecrypt) {
        super(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout)
        this.callback = callback
        this.onUnableToDecrypt = onUnableToDecrypt
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

        this.on('error', () => {
            this._clearGaps()
        })

        this.encryptedMsgsQueues = {}
        this.waitingForGroupKey = {}
        this.nbGroupKeyRequests = {}
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
            console.warn('Failed to decrypt. Requested the correct decryption key(s) and going to try again.')
        }
    }

    _requestGroupKeyAndQueueMessage(msg, start, end) {
        this.emit('groupKeyMissing', msg.getPublisherId(), start, end)
        const publisherId = msg.getPublisherId().toLowerCase()
        this.nbGroupKeyRequests[publisherId] = 1
        const timer = setInterval(() => {
            if (this.nbGroupKeyRequests[publisherId] < MAX_NB_GROUP_KEY_REQUESTS) {
                this.nbGroupKeyRequests[publisherId] += 1
                this.emit('groupKeyMissing', msg.getPublisherId(), start, end)
            } else {
                console.warn(`Failed to receive group key response from ${publisherId} after ${MAX_NB_GROUP_KEY_REQUESTS} requests.`)
                this._cancelGroupKeyRequest(publisherId)
            }
        }, this.propagationTimeout)
        this.waitingForGroupKey[publisherId] = timer
        this._addMsgToQueue(msg)
    }

    _handleEncryptedQueuedMsgs(publisherId) {
        this._cancelGroupKeyRequest(publisherId.toLowerCase())
        const queue = this.encryptedMsgsQueues[publisherId.toLowerCase()]
        while (queue.length > 0) {
            this._decryptAndHandle(queue[0])
            queue.shift()
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
        return this._catchAndEmitErrors(() => {
            if (!this.isResending()) {
                throw new Error(`There is no resend in progress, but received resent message ${msg.serialize()}`)
            } else {
                const handleMessagePromise = this._handleMessage(msg, verifyFn)
                this._lastMessageHandlerPromise[requestId] = handleMessagePromise
                return handleMessagePromise
            }
        })
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
            this._inOrderHandler(msg)
        }
    }
}
AbstractSubscription.defaultUnableToDecrypt = defaultUnableToDecrypt
AbstractSubscription.MAX_NB_GROUP_KEY_REQUESTS = MAX_NB_GROUP_KEY_REQUESTS
