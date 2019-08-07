import debugFactory from 'debug'

import AbstractSubscription from './AbstractSubscription'

const debug = debugFactory('StreamrClient::Subscription')

export default class RealTimeSubscription extends AbstractSubscription {
    constructor(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout, startMsgRef = null) {
        super(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout)
        this.resending = false
        this.orderingUtil.lastReceivedMsgRef = startMsgRef
    }

    // All the handle* methods should:
    // - return a promise for consistency
    // - swallow exceptions and emit them as 'error' events

    async handleBroadcastMessage(msg, verifyFn) {
        return this._catchAndEmitErrors(() => this._handleMessage(msg, verifyFn))
    }

    _finishResend() {
        this._lastMessageHandlerPromise = null
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
        debug(`Subscription: Stream ${this.streamId} resending: ${resending}`)
        this.resending = resending
    }
}
