import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import qs from 'qs'
import once from 'once'
import { Wallet } from 'ethers'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'
import uniqueId from 'lodash.uniqueid'

import Connection from './Connection'
import Session from './Session'
import SubscribedStreamPartition from './SubscribedStreamPartition'
import { waitFor, getVersionString } from './utils'
import RealTimeSubscription from './RealTimeSubscription'
import CombinedSubscription from './CombinedSubscription'
import Subscription from './Subscription'
import Publisher from './Publisher'
import Resender from './Resender'

const { SubscribeRequest, UnsubscribeRequest, ControlMessage } = ControlLayer

const { StreamMessage } = MessageLayer

export default class StreamrClient extends EventEmitter {
    constructor(options, connection) {
        super()
        this.id = uniqueId('StreamrClient')
        this.debug = debugFactory(this.id)
        // Default options
        this.options = {
            debug: this.debug,
            // The server to connect to
            url: 'wss://streamr.network/api/v1/ws',
            restUrl: 'https://streamr.network/api/v1',
            // Automatically connect on first subscribe
            autoConnect: true,
            // Automatically disconnect on last unsubscribe
            autoDisconnect: true,
            orderMessages: true,
            auth: {},
            publishWithSignature: 'auto',
            verifySignatures: 'auto',
            retryResendAfter: 5000,
            gapFillTimeout: 5000,
            maxPublishQueueSize: 10000,
            streamrNodeAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',
            streamrOperatorAddress: '0xc0aa4dC0763550161a6B59fa430361b5a26df28C',
            tokenAddress: '0x0Cf0Ee63788A0849fE5297F3407f701E122cC023',
        }

        this.subscribedStreamPartitions = {}

        Object.assign(this.options, options || {})

        const parts = this.options.url.split('?')
        if (parts.length === 1) { // there is no query string
            const controlLayer = `controlLayerVersion=${ControlMessage.LATEST_VERSION}`
            const messageLayer = `messageLayerVersion=${StreamMessage.LATEST_VERSION}`
            this.options.url = `${this.options.url}?${controlLayer}&${messageLayer}`
        } else {
            const queryObj = qs.parse(parts[1])
            if (!queryObj.controlLayerVersion) {
                this.options.url = `${this.options.url}&controlLayerVersion=1`
            }

            if (!queryObj.messageLayerVersion) {
                this.options.url = `${this.options.url}&messageLayerVersion=31`
            }
        }

        // always add streamrClient version
        this.options.url = `${this.options.url}&streamrClient=${getVersionString()}`

        // Backwards compatibility for option 'authKey' => 'apiKey'
        if (this.options.authKey && !this.options.apiKey) {
            this.options.apiKey = this.options.authKey
        }

        if (this.options.apiKey) {
            this.options.auth.apiKey = this.options.apiKey
        }

        if (this.options.auth.privateKey && !this.options.auth.privateKey.startsWith('0x')) {
            this.options.auth.privateKey = `0x${this.options.auth.privateKey}`
        }

        this.session = new Session(this, this.options.auth)
        // Event handling on connection object
        this.connection = connection || new Connection(this.options)

        this.getUserInfo = this.getUserInfo.bind(this)

        this.on('error', (...args) => {
            this.onError(...args)
            this.ensureDisconnected()
        })

        // Broadcast messages to all subs listening on stream-partition
        this.connection.on(ControlMessage.TYPES.BroadcastMessage, (msg) => {
            const stream = this._getSubscribedStreamPartition(msg.streamMessage.getStreamId(), msg.streamMessage.getStreamPartition())
            if (stream) {
                const verifyFn = once(() => stream.verifyStreamMessage(msg.streamMessage)) // ensure verification occurs only once
                // sub.handleBroadcastMessage never rejects: on any error it emits an 'error' event on the Subscription
                stream.getSubscriptions().forEach((sub) => sub.handleBroadcastMessage(msg.streamMessage, verifyFn))
            } else {
                this.debug('WARN: message received for stream with no subscriptions: %s', msg.streamMessage.getStreamId())
            }
        })

        this.connection.on(ControlMessage.TYPES.SubscribeResponse, (response) => {
            const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
            if (stream) {
                stream.setSubscribing(false)
                stream.getSubscriptions().filter((sub) => !sub.resending)
                    .forEach((sub) => sub.setState(Subscription.State.subscribed))
            }
            this.debug('Client subscribed: streamId: %s, streamPartition: %s', response.streamId, response.streamPartition)
        })

        this.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (response) => {
            this.debug('Client unsubscribed: streamId: %s, streamPartition: %s', response.streamId, response.streamPartition)
            const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
            if (stream) {
                stream.getSubscriptions().forEach((sub) => {
                    this._removeSubscription(sub)
                    sub.setState(Subscription.State.unsubscribed)
                })
            }

            this._checkAutoDisconnect()
        })

        // On connect/reconnect, send pending subscription requests
        this.connection.on('connected', async () => {
            await new Promise((resolve) => setTimeout(resolve, 0)) // wait a tick to let event handlers finish
            if (!this.isConnected()) { return }
            this.debug('Connected!')
            this.emit('connected')
            try {
                if (!this.isConnected()) { return }
                // Check pending subscriptions
                Object.keys(this.subscribedStreamPartitions).forEach((key) => {
                    this.subscribedStreamPartitions[key].getSubscriptions().forEach((sub) => {
                        if (sub.getState() !== Subscription.State.subscribed) {
                            this._resendAndSubscribe(sub).catch((err) => {
                                this.emit('error', err)
                            })
                        }
                    })
                })
            } catch (err) {
                this.emit('error', err)
            }
        })

        this.connection.on('disconnected', () => {
            this.debug('Disconnected.')
            this.emit('disconnected')

            Object.keys(this.subscribedStreamPartitions)
                .forEach((key) => {
                    const stream = this.subscribedStreamPartitions[key]
                    stream.setSubscribing(false)
                    stream.getSubscriptions().forEach((sub) => {
                        sub.onDisconnected()
                    })
                })
        })

        this.connection.on(ControlMessage.TYPES.ErrorResponse, (err) => {
            const errorObject = new Error(err.errorMessage)
            this.emit('error', errorObject)
        })

        this.connection.on('error', async (err) => {
            // If there is an error parsing a json message in a stream, fire error events on the relevant subs
            if (err instanceof Errors.InvalidJsonError) {
                const stream = this._getSubscribedStreamPartition(err.streamMessage.getStreamId(), err.streamMessage.getStreamPartition())
                if (stream) {
                    stream.getSubscriptions().forEach((sub) => sub.handleError(err))
                } else {
                    this.debug('WARN: InvalidJsonError received for stream with no subscriptions: %s', err.streamId)
                }
            } else {
                // if it looks like an error emit as-is, otherwise wrap in new Error
                const errorObject = (err && err.stack && err.message) ? err : new Error(err)
                this.emit('error', errorObject)
            }
        })

        this.publisher = new Publisher(this)
        this.resender = new Resender(this)
    }

    /**
     * Override to control output
     */

    onError(error) { // eslint-disable-line class-methods-use-this
        console.error(error)
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
            sp = new SubscribedStreamPartition(this, sub.streamId, sub.streamPartition)
            this._addSubscribedStreamPartition(sp)
        }
        sp.addSubscription(sub)
    }

    _removeSubscription(sub) {
        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        if (sp) {
            sp.removeSubscription(sub)
            if (sp.getSubscriptions().length === 0) {
                this._deleteSubscribedStreamPartition(sp)
            }
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

    async resend(...args) {
        return this.resender.resend(...args)
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

    subscribe(optionsOrStreamId, callback, legacyOptions) {
        const options = this._validateParameters(optionsOrStreamId, callback)

        // Backwards compatibility for giving an options object as third argument
        Object.assign(options, legacyOptions)

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
                propagationTimeout: this.options.gapFillTimeout,
                resendTimeout: this.options.retryResendAfter,
                orderMessages: this.options.orderMessages,
                debug: this.debug,
            })
        } else {
            sub = new RealTimeSubscription({
                streamId: options.stream,
                streamPartition: options.partition || 0,
                callback,
                options: options.resend,
                propagationTimeout: this.options.gapFillTimeout,
                resendTimeout: this.options.retryResendAfter,
                orderMessages: this.options.orderMessages,
                debug: this.debug,
            })
        }
        sub.on('gap', (from, to, publisherId, msgChainId) => {
            if (!sub.resending) {
                this.resender._requestResend(sub, {
                    from, to, publisherId, msgChainId,
                })
            }
        })
        sub.on('done', () => {
            this.debug('done event for sub %d', sub.id)
            this.unsubscribe(sub)
        })

        // Add to lookups
        this._addSubscription(sub)

        // If connected, emit a subscribe request
        if (this.isConnected()) {
            this._resendAndSubscribe(sub)
        } else if (this.options.autoConnect) {
            this.ensureConnected()
        }

        return sub
    }

    unsubscribe(sub) {
        if (!sub || !sub.streamId) {
            throw new Error('unsubscribe: please give a Subscription object as an argument!')
        }

        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)

        // If this is the last subscription for this stream-partition, unsubscribe the client too
        if (sp && sp.getSubscriptions().length === 1
            && this.isConnected()
            && sub.getState() === Subscription.State.subscribed) {
            sub.setState(Subscription.State.unsubscribing)
            this._requestUnsubscribe(sub)
        } else if (sub.getState() !== Subscription.State.unsubscribing && sub.getState() !== Subscription.State.unsubscribed) {
            // Else the sub can be cleaned off immediately
            this._removeSubscription(sub)
            sub.setState(Subscription.State.unsubscribed)
            this._checkAutoDisconnect()
        }
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

    isConnected() {
        return this.connection.state === Connection.State.CONNECTED
    }

    isConnecting() {
        return this.connection.state === Connection.State.CONNECTING
    }

    isDisconnecting() {
        return this.connection.state === Connection.State.DISCONNECTING
    }

    isDisconnected() {
        return this.connection.state === Connection.State.DISCONNECTED
    }

    reconnect() {
        return this.connect()
    }

    async connect() {
        try {
            if (this.isConnected()) {
                throw new Error('Already connected!')
            }

            if (this.connection.state === Connection.State.CONNECTING) {
                throw new Error('Already connecting!')
            }

            this.debug('Connecting to %s', this.options.url)
            await this.connection.connect()
        } catch (err) {
            this.emit('error', err)
            throw err
        }
    }

    pause() {
        return this.connection.disconnect()
    }

    disconnect() {
        this.publisher.stop()
        this.subscribedStreamPartitions = {}
        return this.connection.disconnect()
    }

    logout() {
        return this.session.logout()
    }

    async publish(...args) {
        return this.publisher.publish(...args)
    }

    getPublisherId() {
        return this.publisher.getPublisherId()
    }

    /**
     * Starts new connection if disconnected.
     * Waits for connection if connecting.
     * No-op if already connected.
     */

    async ensureConnected() {
        if (this.isConnected()) { return Promise.resolve() }

        if (!this.isConnecting()) {
            await this.connect()
        }
        return waitFor(this, 'connected')
    }

    /**
     * Starts disconnection if connected.
     * Waits for disconnection if disconnecting.
     * No-op if already disconnected.
     */

    async ensureDisconnected() {
        this.connection.clearReconnectTimeout()
        this.publisher.stop()
        if (this.isDisconnected()) { return }

        if (this.isDisconnecting()) {
            await waitFor(this, 'disconnected')
            return
        }

        await this.disconnect()
    }

    _checkAutoDisconnect() {
        // Disconnect if no longer subscribed to any streams
        if (this.options.autoDisconnect && Object.keys(this.subscribedStreamPartitions).length === 0) {
            this.debug('Disconnecting due to no longer being subscribed to any streams')
            this.disconnect()
        }
    }

    async _resendAndSubscribe(sub) {
        if (sub.getState() === Subscription.State.subscribing || sub.resending) { return }
        sub.setState(Subscription.State.subscribing)
        // Once subscribed, ask for a resend
        sub.once('subscribed', () => {
            if (!sub.hasResendOptions()) { return }

            this.resender._requestResend(sub)
        })
        await this._requestSubscribe(sub)
    }

    async _requestSubscribe(sub) {
        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        let subscribedSubs = []
        // never reuse subscriptions when incoming subscription needs resends
        // i.e. only reuse realtime subscriptions
        if (!sub.hasResendOptions()) {
            subscribedSubs = sp.getSubscriptions().filter((it) => (
                it.getState() === Subscription.State.subscribed
                // don't resuse subscriptions currently resending
                && !it.isResending()
            ))
        }

        const sessionToken = await this.session.getSessionToken()

        // If this is the first subscription for this stream-partition, send a subscription request to the server
        if (!sp.isSubscribing() && subscribedSubs.length === 0) {
            const request = new SubscribeRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                sessionToken,
                requestId: this.resender.resendUtil.generateRequestId(),
            })
            this.debug('_requestSubscribe: subscribing client: %o', request)
            sp.setSubscribing(true)
            await this.connection.send(request).catch((err) => {
                sub.setState(Subscription.State.unsubscribed)
                this.emit('error', `Failed to send subscribe request: ${err}`)
            })
        } else if (subscribedSubs.length > 0) {
            // If there already is a subscribed subscription for this stream, this new one will just join it immediately
            this.debug('_requestSubscribe: another subscription for same stream: %s, insta-subscribing', sub.streamId)

            setTimeout(() => {
                sub.setState(Subscription.State.subscribed)
            })
        }
    }

    async _requestUnsubscribe(sub) {
        this.debug('Client unsubscribing stream %o partition %o', sub.streamId, sub.streamPartition)
        const unsubscribeRequest = new UnsubscribeRequest({
            streamId: sub.streamId,
            streamPartition: sub.streamPartition,
            requestId: this.resender.resendUtil.generateRequestId(),
        })
        await this.connection.send(unsubscribeRequest).catch((err) => {
            sub.setState(Subscription.State.subscribed)
            this.handleError(`Failed to send unsubscribe request: ${err}`)
        })
    }


    handleError(msg) {
        this.debug(msg)
        this.emit('error', msg)
    }

    static generateEthereumAccount() {
        const wallet = Wallet.createRandom()
        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
        }
    }
}
