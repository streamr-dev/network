import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'

const debug = debugFactory('StreamrClient::Subscription')

let requestId = 0
function generateSubscriptionId() {
    const id = requestId
    requestId += 1
    return id.toString()
}

const DEFAULT_PROPAGATION_TIMEOUT = 5000
const DEFAULT_RESEND_TIMEOUT = 5000
/*
'interface' containing the default parameters and functionalities common to every subscription (Combined, RealTime and Historical)
 */
export default class Subscription extends EventEmitter {
    constructor(streamId, streamPartition, callback, groupKeys,
        propagationTimeout = DEFAULT_PROPAGATION_TIMEOUT, resendTimeout = DEFAULT_RESEND_TIMEOUT) {
        super()
        if (!streamId) {
            throw new Error('No stream id given!')
        }

        if (!callback) {
            throw new Error('No callback given!')
        }
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.id = generateSubscriptionId()
        this.groupKeys = groupKeys || {}
        this.propagationTimeout = propagationTimeout
        this.resendTimeout = resendTimeout
        this.state = Subscription.State.unsubscribed
    }

    getState() {
        return this.state
    }

    setState(state) {
        debug(`Subscription: Stream ${this.streamId} state changed ${this.state} => ${state}`)
        this.state = state
        this.emit(state)
    }
}

Subscription.State = {
    unsubscribed: 'unsubscribed',
    subscribing: 'subscribing',
    subscribed: 'subscribed',
    unsubscribing: 'unsubscribing',
}
