import HistoricalSubscription from './HistoricalSubscription'
import RealTimeSubscription from './RealTimeSubscription'
import Subscription from './Subscription'

export default class CombinedSubscription extends Subscription {
    constructor(streamId, streamPartition, callback, options, groupKeys, propagationTimeout, resendTimeout, orderMessages = true) {
        super(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout)

        this.sub = new HistoricalSubscription(streamId, streamPartition, callback, options,
            groupKeys, this.propagationTimeout, this.resendTimeout, orderMessages)
        this.realTimeMsgsQueue = []
        this.sub.on('message received', (msg) => {
            if (msg) {
                this.realTimeMsgsQueue.push(msg)
            }
        })
        this.sub.on('initial_resend_done', async () => {
            const realTime = new RealTimeSubscription(streamId, streamPartition, callback,
                groupKeys, this.propagationTimeout, this.resendTimeout, orderMessages)
            if (this.sub.orderingUtil) {
                realTime.orderingUtil.orderedChains = this.sub.orderingUtil.orderedChains
                Object.keys(this.sub.orderingUtil.orderedChains).forEach((key) => {
                    realTime.orderingUtil.orderedChains[key].inOrderHandler = realTime.orderingUtil.inOrderHandler
                    realTime.orderingUtil.orderedChains[key].gapHandler = realTime.orderingUtil.gapHandler
                })
            }
            this._bindListeners(realTime)
            await Promise.all(this.realTimeMsgsQueue.map((msg) => realTime.handleBroadcastMessage(msg, () => true)))
            this.sub = realTime
        })
        this._bindListeners(this.sub)
    }

    _bindListeners(sub) {
        sub.on('done', () => this.emit('done'))
        sub.on('gap', (from, to, publisherId, msgChainId) => this.emit('gap', from, to, publisherId, msgChainId))
        sub.on('error', (err) => this.emit('error', err))
        sub.on('resending', (response) => this.emit('resending', response))
        sub.on('resent', (response) => this.emit('resent', response))
        sub.on('no_resend', (response) => this.emit('no_resend', response))
        sub.on('initial_resend_done', (response) => this.emit('initial_resend_done', response))
        sub.on('message received', () => this.emit('message received'))
        Object.keys(Subscription.State).forEach((state) => this.sub.on(state, () => this.emit(state)))
    }

    stop() {
        return this.sub.stop()
    }

    addPendingResendRequestId(requestId) {
        this.sub.addPendingResendRequestId(requestId)
    }

    async handleResentMessage(msg, requestId, verifyFn) {
        return this.sub.handleResentMessage(msg, requestId, verifyFn)
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

    finishResend() {
        return this.sub.finishResend()
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
