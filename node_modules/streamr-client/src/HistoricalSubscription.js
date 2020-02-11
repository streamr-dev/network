import AbstractSubscription from './AbstractSubscription'

export default class HistoricalSubscription extends AbstractSubscription {
    constructor(streamId, streamPartition, callback, options, groupKeys, propagationTimeout, resendTimeout, orderMessages = true) {
        super(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout, orderMessages)
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
    }

    async handleBroadcastMessage(msg, verifyFn) {
        await AbstractSubscription.validate(msg, verifyFn)
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

    finishResend() {
        if (Object.keys(this.pendingResendRequestIds).length === 0) {
            this.emit('initial_resend_done')
        }
    }
}
