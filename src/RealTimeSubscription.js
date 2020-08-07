import debugFactory from 'debug'
import uniqueId from 'lodash.uniqueid'

import Subscription from './Subscription'
import AbstractSubscription from './AbstractSubscription'
import EncryptionUtil from './EncryptionUtil'
import UnableToDecryptError from './errors/UnableToDecryptError'

export default class RealTimeSubscription extends AbstractSubscription {
    constructor({
        streamId,
        streamPartition,
        callback,
        groupKeys,
        onUnableToDecrypt = AbstractSubscription.defaultUnableToDecrypt,
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
            onUnableToDecrypt,
            propagationTimeout,
            resendTimeout,
            orderMessages,
            debug,
        })

        const id = uniqueId('Subscription')
        if (debug) {
            this.debug = debug.extend(id)
        } else {
            this.debug = debugFactory(`StreamrClient::${id}`)
        }

        this.alreadyFailedToDecrypt = {}
        this.resending = false
    }

    // All the handle* methods should:
    // - return a promise for consistency
    // - swallow exceptions and emit them as 'error' events

    async handleBroadcastMessage(msg, verifyFn) {
        return this._catchAndEmitErrors(() => this._handleMessage(msg, verifyFn))
    }

    finishResend() {
        this.setResending(false)
    }

    // passing publisherId separately to ensure it is lowercase (See call of this function in AbstractSubscription.js)
    _decryptOrRequestGroupKey(msg, publisherId) {
        let newGroupKey
        try {
            newGroupKey = EncryptionUtil.decryptStreamMessage(msg, this.groupKeys[publisherId])
        } catch (e) {
            if (e instanceof UnableToDecryptError && !this.alreadyFailedToDecrypt[publisherId]) {
                this._requestGroupKeyAndQueueMessage(msg)
                this.alreadyFailedToDecrypt[publisherId] = true
                return false
            }
            throw e
        }
        delete this.alreadyFailedToDecrypt[publisherId]
        if (newGroupKey) {
            this.groupKeys[publisherId] = newGroupKey
        }
        return true
    }

    /* eslint-disable class-methods-use-this */
    hasResendOptions() {
        return false
    }

    getResendOptions() {
        return {}
    }
    /* eslint-enable class-methods-use-this */

    isResending() {
        return this.resending
    }

    setResending(resending) {
        this.debug(`Subscription: Stream ${this.streamId} resending: ${resending}`)
        this.resending = resending
    }

    setGroupKeys(publisherId, groupKeys) {
        if (groupKeys.length !== 1) {
            throw new Error('Received multiple group keys for a real time subscription (expected one).')
        }
        /* eslint-disable prefer-destructuring */
        this.groupKeys[publisherId.toLowerCase()] = groupKeys[0]
        /* eslint-enable prefer-destructuring */
        this._handleEncryptedQueuedMsgs(publisherId)
    }

    onDisconnected() {
        this.setState(Subscription.State.unsubscribed)
    }
}
