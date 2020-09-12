import once from 'once'
import { ControlLayer, Errors } from 'streamr-client-protocol'

import SubscribedStreamPartition from './SubscribedStreamPartition'
import RealTimeSubscription from './RealTimeSubscription'
import CombinedSubscription from './CombinedSubscription'
import Subscription from './Subscription'

const { SubscribeRequest, UnsubscribeRequest, ControlMessage } = ControlLayer

export default class Subscriber {
    constructor(client) {
        this.client = client
        this.debug = client.debug.extend('Subscriber')

        this.subscribedStreamPartitions = {}

        this.onBroadcastMessage = this.onBroadcastMessage.bind(this)
        this.client.connection.on(ControlMessage.TYPES.BroadcastMessage, this.onBroadcastMessage)

        this.onSubscribeResponse = this.onSubscribeResponse.bind(this)
        this.client.connection.on(ControlMessage.TYPES.SubscribeResponse, this.onSubscribeResponse)

        this.onUnsubscribeResponse = this.onUnsubscribeResponse.bind(this)
        this.client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, this.onUnsubscribeResponse)

        this.onClientConnected = this.onClientConnected.bind(this)
        this.client.on('connected', this.onClientConnected)

        this.onClientDisconnected = this.onClientDisconnected.bind(this)
        this.client.on('disconnected', this.onClientDisconnected)
    }

    onBroadcastMessage(msg) {
        // Broadcast messages to all subs listening on stream-partition
        const stream = this._getSubscribedStreamPartition(msg.streamMessage.getStreamId(), msg.streamMessage.getStreamPartition())
        if (!stream) {
            this.debug('WARN: message received for stream with no subscriptions: %s', msg.streamMessage.getStreamId())
            return
        }

        const verifyFn = once(() => stream.verifyStreamMessage(msg.streamMessage)) // ensure verification occurs only once
        // sub.handleBroadcastMessage never rejects: on any error it emits an 'error' event on the Subscription
        stream.getSubscriptions().forEach((sub) => sub.handleBroadcastMessage(msg.streamMessage, verifyFn))
    }

    onSubscribeResponse(response) {
        if (!this.client.isConnected()) { return }
        this.debug('onSubscribeResponse')
        const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
        if (stream) {
            stream.setSubscribing(false)
            stream.getSubscriptions().filter((sub) => !sub.resending)
                .forEach((sub) => sub.setState(Subscription.State.subscribed))
        }
        this.debug('Client subscribed: streamId: %s, streamPartition: %s', response.streamId, response.streamPartition)
    }

    onUnsubscribeResponse(response) {
        this.debug('Client unsubscribed: streamId: %s, streamPartition: %s', response.streamId, response.streamPartition)
        const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
        if (stream) {
            stream.getSubscriptions().forEach((sub) => {
                this._removeSubscription(sub)
                sub.setState(Subscription.State.unsubscribed)
            })
        }

        return this._checkAutoDisconnect()
    }

    async onClientConnected() {
        try {
            if (!this.client.isConnected()) { return }
            // Check pending subscriptions
            Object.keys(this.subscribedStreamPartitions).forEach((key) => {
                this.subscribedStreamPartitions[key].getSubscriptions().forEach((sub) => {
                    if (sub.getState() !== Subscription.State.subscribed) {
                        this._resendAndSubscribe(sub).catch((err) => {
                            this.client.emit('error', err)
                        })
                    }
                })
            })
        } catch (err) {
            this.client.emit('error', err)
        }
    }

    onClientDisconnected() {
        Object.keys(this.subscribedStreamPartitions).forEach((key) => {
            const stream = this.subscribedStreamPartitions[key]
            stream.setSubscribing(false)
            stream.getSubscriptions().forEach((sub) => {
                sub.onDisconnected()
            })
        })
    }

    onErrorMessage(err) {
        // not ideal, see error handler in client
        if (!(err instanceof Errors.InvalidJsonError || err.reason instanceof Errors.InvalidJsonError)) {
            return
        }
        // If there is an error parsing a json message in a stream, fire error events on the relevant subs
        const stream = this._getSubscribedStreamPartition(err.streamMessage.getStreamId(), err.streamMessage.getStreamPartition())
        if (stream) {
            stream.getSubscriptions().forEach((sub) => sub.handleError(err))
        } else {
            this.debug('WARN: InvalidJsonError received for stream with no subscriptions: %s', err.streamId)
        }
    }

    subscribe(optionsOrStreamId, callback, legacyOptions) {
        const options = this._validateParameters(optionsOrStreamId, callback)

        // Backwards compatibility for giving an options object as third argument
        Object.assign(options, legacyOptions)

        this.debug('subscribe', options)

        if (!options.stream) {
            throw new Error('subscribe: Invalid arguments: options.stream is not given')
        }

        // Create the Subscription object and bind handlers
        let sub
        if (options.resend) {
            sub = new CombinedSubscription({
                streamId: options.stream,
                streamPartition: options.partition || 0,
                callback,
                options: options.resend,
                propagationTimeout: this.client.options.gapFillTimeout,
                resendTimeout: this.client.options.retryResendAfter,
                orderMessages: this.client.options.orderMessages,
                debug: this.debug,
            })
        } else {
            sub = new RealTimeSubscription({
                streamId: options.stream,
                streamPartition: options.partition || 0,
                callback,
                options: options.resend,
                propagationTimeout: this.client.options.gapFillTimeout,
                resendTimeout: this.client.options.retryResendAfter,
                orderMessages: this.client.options.orderMessages,
                debug: this.debug,
            })
        }
        sub.on('gap', (from, to, publisherId, msgChainId) => {
            this.debug('gap', {
                from, to, publisherId, msgChainId
            })
            if (!sub.resending) {
            // eslint-disable-next-line no-underscore-dangle
                this.client.resender._requestResend(sub, {
                    from, to, publisherId, msgChainId,
                })
            }
        })
        sub.on('done', () => {
            this.debug('done event for sub %s', sub.id)
            this.unsubscribe(sub)
        })

        // Add to lookups
        this._addSubscription(sub)

        // If connected, emit a subscribe request
        if (this.client.isConnected()) {
            this._resendAndSubscribe(sub)
        } else if (this.client.options.autoConnect) {
            this.client.ensureConnected()
        }

        return sub
    }

    async unsubscribe(sub) {
        if (!sub || !sub.streamId) {
            throw new Error('unsubscribe: please give a Subscription object as an argument!')
        }

        const { streamId, streamPartition } = sub

        this.debug('unsubscribe', {
            streamId,
            streamPartition,
        })

        const sp = this._getSubscribedStreamPartition(streamId, streamPartition)

        // If this is the last subscription for this stream-partition, unsubscribe the client too
        if (sp
            && sp.getSubscriptions().length === 1
            && sub.getState() === Subscription.State.subscribed
        ) {
            this.debug('last subscription')
            sub.setState(Subscription.State.unsubscribing)
            return this._requestUnsubscribe(sub)
        }

        if (sub.getState() !== Subscription.State.unsubscribing && sub.getState() !== Subscription.State.unsubscribed) {
            this.debug('remove sub')
            this._removeSubscription(sub)
            // Else the sub can be cleaned off immediately
            sub.setState(Subscription.State.unsubscribed)
            return this._checkAutoDisconnect()
        }
        return Promise.resolve()
    }

    unsubscribeAll(streamId, streamPartition) {
        if (!streamId) {
            throw new Error('unsubscribeAll: a stream id is required!')
        } else if (typeof streamId !== 'string') {
            throw new Error('unsubscribe: stream id must be a string!')
        }

        let streamPartitions = []

        // Unsubscribe all subs for the given stream-partition
        if (streamPartition) {
            const sp = this._getSubscribedStreamPartition(streamId, streamPartition)
            if (sp) {
                streamPartitions = [sp]
            }
        } else {
            streamPartitions = this._getSubscribedStreamPartitionsForStream(streamId)
        }

        streamPartitions.forEach((sp) => {
            sp.getSubscriptions().forEach((sub) => {
                this.unsubscribe(sub)
            })
        })
    }

    _getSubscribedStreamPartition(streamId, streamPartition) {
        const key = streamId + streamPartition
        return this.subscribedStreamPartitions[key]
    }

    _getSubscribedStreamPartitionsForStream(streamId) {
        // TODO: pretty crude method, could improve
        return Object.values(this.subscribedStreamPartitions)
            .filter((stream) => stream.streamId === streamId)
    }

    _addSubscribedStreamPartition(subscribedStreamPartition) {
        const key = subscribedStreamPartition.streamId + subscribedStreamPartition.streamPartition
        this.subscribedStreamPartitions[key] = subscribedStreamPartition
    }

    _deleteSubscribedStreamPartition(subscribedStreamPartition) {
        const key = subscribedStreamPartition.streamId + subscribedStreamPartition.streamPartition
        delete this.subscribedStreamPartitions[key]
    }

    _addSubscription(sub) {
        let sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        if (!sp) {
            sp = new SubscribedStreamPartition(this.client, sub.streamId, sub.streamPartition)
            this._addSubscribedStreamPartition(sp)
        }
        sp.addSubscription(sub)
    }

    _removeSubscription(sub) {
        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        if (!sp) {
            return
        }
        sp.removeSubscription(sub)
        if (sp.getSubscriptions().length === 0) {
            this._deleteSubscribedStreamPartition(sp)
        }
    }

    getSubscriptions(streamId, streamPartition) {
        let subs = []

        if (streamPartition) {
            const sp = this._getSubscribedStreamPartition(streamId, streamPartition)
            if (sp) {
                subs = sp.getSubscriptions()
            }
        } else {
            const sps = this._getSubscribedStreamPartitionsForStream(streamId)
            sps.forEach((sp) => sp.getSubscriptions().forEach((sub) => subs.push(sub)))
        }

        return subs
    }

    stop() {
        this.subscribedStreamPartitions = {}
    }

    async _requestSubscribe(sub) {
        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        // never reuse subscriptions when incoming subscription needs resends
        // i.e. only reuse realtime subscriptions
        if (!sub.hasResendOptions()) {
            const subscribedSubs = sp.getSubscriptions().filter((it) => (
                it.getState() === Subscription.State.subscribed
                // don't resuse subscriptions currently resending
                && !it.isResending()
            ))

            if (subscribedSubs.length) {
                // If there already is a subscribed subscription for this stream, this new one will just join it immediately
                this.debug('_requestSubscribe: another subscription for same stream: %s, insta-subscribing', sub.streamId)

                setTimeout(() => {
                    sub.setState(Subscription.State.subscribed)
                })
                return
            }
        }

        const sessionToken = await this.client.session.getSessionToken()

        if (sp.isSubscribing()) {
            return
        }

        // If this is the first subscription for this stream-partition, send a subscription request to the server
        const request = new SubscribeRequest({
            streamId: sub.streamId,
            streamPartition: sub.streamPartition,
            sessionToken,
            requestId: this.client.resender.resendUtil.generateRequestId(),
        })
        sp.setSubscribing(true)
        this.debug('_requestSubscribe: subscribing client: %o', request)
        await this.client.send(request).catch((err) => {
            sub.setState(Subscription.State.unsubscribed)
            this.client.emit('error', new Error(`Failed to send subscribe request: ${err.stack}`))
        })
    }

    async _requestUnsubscribe(sub) {
        this.debug('Client unsubscribing stream %o partition %o', sub.streamId, sub.streamPartition)
        const unsubscribeRequest = new UnsubscribeRequest({
            streamId: sub.streamId,
            streamPartition: sub.streamPartition,
            requestId: this.client.resender.resendUtil.generateRequestId(),
        })
        await this.client.connection.send(unsubscribeRequest).catch((err) => {
            sub.setState(Subscription.State.subscribed)
            this.client.handleError(`Failed to send unsubscribe request: ${err.stack}`)
        })
        return this._checkAutoDisconnect()
    }

    async _checkAutoDisconnect() {
        // Disconnect if no longer subscribed to any streams
        if (this.client.options.autoDisconnect && Object.keys(this.subscribedStreamPartitions).length === 0) {
            this.debug('Disconnecting due to no longer being subscribed to any streams')
            return this.client.disconnect()
        }
        return Promise.resolve()
    }

    // eslint-disable-next-line class-methods-use-this
    _validateParameters(optionsOrStreamId, callback) {
        if (!optionsOrStreamId) {
            throw new Error('subscribe/resend: Invalid arguments: options is required!')
        } else if (!callback) {
            throw new Error('subscribe/resend: Invalid arguments: callback is required!')
        }

        // Backwards compatibility for giving a streamId as first argument
        let options
        if (typeof optionsOrStreamId === 'string') {
            options = {
                stream: optionsOrStreamId,
            }
        } else if (typeof optionsOrStreamId === 'object') {
            // shallow copy
            options = {
                ...optionsOrStreamId
            }
        } else {
            throw new Error(`subscribe/resend: options must be an object! Given: ${optionsOrStreamId}`)
        }

        return options
    }

    async _resendAndSubscribe(sub) {
        if (sub.getState() === Subscription.State.subscribing || sub.resending) {
            return Promise.resolve()
        }

        sub.setState(Subscription.State.subscribing)
        return Promise.all([
            this._requestSubscribe(sub),
            // eslint-disable-next-line no-underscore-dangle
            sub.hasResendOptions() && this.client.resender._requestResend(sub),
        ])

        // const onSubscribed = new Promise((resolve, reject) => {
        // this.debug('add resend on sub')
        /// / Once subscribed, ask for a resend
        // sub.once('subscribed', () => {
        /// / eslint-disable-next-line no-underscore-dangle
        // resolve(this.client.resender._requestResend(sub))
        // })
        // sub.once('error', reject)
        // })
        // await this._requestSubscribe(sub)

        // return onSubscribed
    }
}
