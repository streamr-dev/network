import HistoricalSubscription from './HistoricalSubscription'
import RealTimeSubscription from './RealTimeSubscription'
import Subscription from './Subscription'

export default class CombinedSubscription extends Subscription {
    constructor(streamId, streamPartition, callback, options, groupKeys, propagationTimeout, resendTimeout) {
        super(streamId, streamPartition, callback, options, groupKeys, propagationTimeout, resendTimeout)

        this.sub = new HistoricalSubscription(streamId, streamPartition, callback, options, groupKeys, this.propagationTimeout, this.resendTimeout)
        this.realTimeMsgsQueue = []
        this.sub.on('message received', (msg) => {
            this.realTimeMsgsQueue.push(msg)
        })
        this.sub.on('resend done', async (lastReceivedMsgRef) => {
            const realTime = new RealTimeSubscription(
                streamId, streamPartition, callback, groupKeys, this.propagationTimeout, this.resendTimeout, lastReceivedMsgRef
            )
            await Promise.all(this.realTimeMsgsQueue.map((msg) => realTime.handleBroadcastMessage(msg, () => true)))
            this.sub.stop()
            this.sub = realTime
            this._bindListeners()
        })
        this._bindListeners()
    }

    _bindListeners() {
        this.sub.on('done', () => this.emit('done'))
        this.sub.on('gap', (from, to, publisherId, msgChainId) => this.emit('gap', from, to, publisherId, msgChainId))
        this.sub.on('error', (err) => this.emit('error', err))
        this.sub.on('resending', (response) => this.emit('resending', response))
        this.sub.on('resent', (response) => this.emit('resent', response))
        this.sub.on('no_resend', (response) => this.emit('no_resend', response))
        this.sub.on('message received', () => this.emit('message received'))
        Object.keys(Subscription.State).forEach((state) => this.sub.on(state, () => this.emit(state)))
    }

    stop() {
        return this.sub.stop()
    }

    async handleResentMessage(msg, verifyFn) {
        return this.sub.handleResentMessage(msg, verifyFn)
    }

    async handleResending(response) {
        return this.sub.handleResending(response)
    }

    async handleResent(response) {
        return this.sub.handleResent(response)
    }

    async handleNoResend(response) {
        return this.sub.handleNoResend(response)
    }

    async handleBroadcastMessage(msg, verifyFn) {
        return this.sub.handleBroadcastMessage(msg, verifyFn)
    }

    hasResendOptions() {
        return this.sub.hasResendOptions()
    }

    getResendOptions() {
        return this.sub.getResendOptions()
    }

    setResending(resending) {
        return this.sub.setResending(resending)
    }

    setState(state) {
        super.setState(state)
        this.sub.state = state
    }

    handleError(err) {
        return this.sub.handleError(err)
    }
}
