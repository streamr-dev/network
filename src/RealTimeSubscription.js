import debugFactory from 'debug'
import uniqueId from 'lodash.uniqueid'

import Subscription from './Subscription'
import AbstractSubscription from './AbstractSubscription'

export default class RealTimeSubscription extends AbstractSubscription {
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
            orderMessages,
            debug,
        })

        const id = uniqueId('Subscription')
        if (debug) {
            this.debug = debug.extend(id)
        } else {
            this.debug = debugFactory(`StreamrClient::${id}`)
        }

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

    onDisconnected() {
        this.setState(Subscription.State.unsubscribed)
    }
}
