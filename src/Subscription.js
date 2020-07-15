import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import uniqueId from 'lodash.uniqueid'

const debug = debugFactory('StreamrClient::Subscription')

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
        this.callback = callback
        this.id = uniqueId('sub')
        this.groupKeys = {}
        if (groupKeys) {
            Object.keys(groupKeys).forEach((publisherId) => {
                this.groupKeys[publisherId.toLowerCase()] = groupKeys[publisherId]
            })
        }
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

    /* eslint-disable class-methods-use-this */
    onDisconnected() {
        throw new Error('Must be defined in child class')
    }
    /* eslint-enable class-methods-use-this */
}

Subscription.State = {
    unsubscribed: 'unsubscribed',
    subscribing: 'subscribing',
    subscribed: 'subscribed',
    unsubscribing: 'unsubscribing',
}
