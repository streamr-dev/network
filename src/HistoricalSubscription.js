import { MessageLayer } from 'streamr-client-protocol'

import AbstractSubscription from './AbstractSubscription'
import DecryptionKeySequence from './DecryptionKeySequence'

const { StreamMessage } = MessageLayer

export default class HistoricalSubscription extends AbstractSubscription {
    constructor({
        streamId,
        streamPartition,
        callback,
        groupKeys,
        onUnableToDecrypt = AbstractSubscription.defaultUnableToDecrypt,
        options,
        propagationTimeout,
        resendTimeout,
        orderMessages = true,
        debug
    }) {
        super({
            streamId,
            streamPartition,
            callback,
            groupKeys,
            onUnableToDecrypt,
            propagationTimeout,
            resendTimeout,
            orderMessages,
            debug,
        })
        this.resendOptions = options
        if (!this.resendOptions || (!this.resendOptions.from && !this.resendOptions.last)) {
            throw new Error('Resend options (either "from", "from" and "to", or "last") must be defined in a historical subscription.')
        }

        if (this.resendOptions.from != null && this.resendOptions.last != null) {
            throw new Error(`Multiple resend options active! Please use only one: ${JSON.stringify(this.resendOptions)}`)
        }

        if (this.resendOptions.msgChainId != null && typeof this.resendOptions.publisherId === 'undefined') {
            throw new Error('publisherId must be defined as well if msgChainId is defined.')
        }

        if (this.resendOptions.from == null && this.resendOptions.to != null) {
            throw new Error('"from" must be defined as well if "to" is defined.')
        }
        this.keySequences = {}
        Object.keys(this.groupKeys).forEach((publisherId) => {
            this.keySequences[publisherId] = new DecryptionKeySequence([this.groupKeys[publisherId]])
        })
    }

    // passing publisherId separately to ensure it is lowercase (See call of this function in AbstractSubscription.js)
    _decryptOrRequestGroupKey(msg, publisherId) {
        if (msg.encryptionType !== StreamMessage.ENCRYPTION_TYPES.AES && msg.encryptionType !== StreamMessage.ENCRYPTION_TYPES.NEW_KEY_AND_AES) {
            return true
        }

        if (!this.keySequences[publisherId]) {
            const start = msg.getTimestamp()
            const end = this.resendOptions.to ? this.resendOptions.to : Date.now()
            this._requestGroupKeyAndQueueMessage(msg, start, end)
            return false
        }
        this.keySequences[publisherId].tryToDecryptResent(msg)
        return true
    }

    async handleBroadcastMessage(msg, verifyFn) {
        await this._queuedValidate(msg, verifyFn)
        this.emit('message received', msg)
    }

    /* eslint-disable class-methods-use-this */
    hasResendOptions() {
        return true
    }

    isResending() {
        return true
    }

    setResending() {}
    /* eslint-enable class-methods-use-this */

    getResendOptions() {
        return this.resendOptions
    }

    setGroupKeys(publisherId, groupKeys) {
        if (this.keySequences[publisherId.toLowerCase()]) {
            throw new Error(`Received historical group keys for publisher ${publisherId} for a second time.`)
        }
        this.keySequences[publisherId.toLowerCase()] = new DecryptionKeySequence(groupKeys)
        this._handleEncryptedQueuedMsgs(publisherId)
        if (this.resendDone && this._emptyMsgQueues()) { // the messages in the queue were the last ones to handle
            this.emit('resend done')
        }
    }

    finishResend() {
        this._lastMessageHandlerPromise = null
        if (!this._emptyMsgQueues()) { // received all historical messages but not yet the keys to decrypt them
            this.resendDone = true
        } else if (Object.keys(this.pendingResendRequestIds).length === 0) {
            this.emit('initial_resend_done')
        }
    }

    /* eslint-disable class-methods-use-this */
    onDisconnected() {}
    /* eslint-enable class-methods-use-this */
}
