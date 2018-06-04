import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'

const debug = debugFactory('StreamrClient')

import Subscription from './Subscription'
import Connection from './Connection'

export default class StreamrClient extends EventEmitter {
    constructor(options) {
        super()

        // Default options
        this.options = {
            // The server to connect to
            url: 'wss://www.streamr.com/api/v1/ws',
            restUrl: 'https://www.streamr.com/api/v1',
            // Automatically connect on first subscribe
            autoConnect: true,
            // Automatically disconnect on last unsubscribe
            autoDisconnect: true,
            apiKey: null,
        }
        this.subsByStream = {}
        this.subById = {}

        this.connection = null
        this.connected = false

        Object.assign(this.options, options || {})

        // Backwards compatibility for option 'authKey' => 'apiKey'
        if (this.options.authKey && !this.options.apiKey) {
            this.options.apiKey = this.options.authKey
        }
    }

    _addSubscription(sub) {
        this.subById[sub.id] = sub

        if (!this.subsByStream[sub.streamId]) {
            this.subsByStream[sub.streamId] = [sub]
        } else {
            this.subsByStream[sub.streamId].push(sub)
        }
    }

    _removeSubscription(sub) {
        delete this.subById[sub.id]

        if (this.subsByStream[sub.streamId]) {
            this.subsByStream[sub.streamId] = this.subsByStream[sub.streamId].filter((it) => it !== sub)

            if (this.subsByStream[sub.streamId].length === 0) {
                delete this.subsByStream[sub.streamId]
            }
        }
    }

    getSubscriptions(streamId) {
        return this.subsByStream[streamId] || []
    }

    subscribe(optionsOrStreamId, callback, legacyOptions) {
        if (!optionsOrStreamId) {
            throw new Error('subscribe: Invalid arguments: subscription options is required!')
        } else if (!callback) {
            throw new Error('subscribe: Invalid arguments: callback is required!')
        }

        // Backwards compatibility for giving a streamId as first argument
        let options
        if (typeof optionsOrStreamId === 'string') {
            options = {
                stream: optionsOrStreamId,
            }
        } else if (typeof optionsOrStreamId === 'object') {
            options = optionsOrStreamId
        } else {
            throw new Error(`subscribe: options must be an object! Given: ${optionsOrStreamId}`)
        }

        // Backwards compatibility for giving an options object as third argument
        Object.assign(options, legacyOptions)

        if (!options.stream) {
            throw new Error('subscribe: Invalid arguments: options.stream is not given')
        }

        // Create the Subscription object and bind handlers
        const sub = new Subscription(options.stream, options.partition || 0, options.apiKey || this.options.apiKey, callback, options)
        sub.on('gap', (from, to) => {
            this._requestResend(sub, {
                resend_from: from, resend_to: to,
            })
        })
        sub.on('done', () => {
            debug('done event for sub %d', sub.id)
            this.unsubscribe(sub)
        })

        // Add to lookups
        this._addSubscription(sub)

        // If connected, emit a subscribe request
        if (this.connected) {
            this._resendAndSubscribe(sub)
        } else if (this.options.autoConnect) {
            this.connect()
        }

        return sub
    }

    unsubscribe(sub) {
        if (!sub || !sub.streamId) {
            throw new Error('unsubscribe: please give a Subscription object as an argument!')
        }

        // If this is the last subscription for this stream, unsubscribe the client too
        if (this.subsByStream[sub.streamId] !== undefined && this.subsByStream[sub.streamId].length === 1
            && this.connected && !this.disconnecting && sub.getState() === Subscription.State.subscribed) {
            sub.setState(Subscription.State.unsubscribing)
            this._requestUnsubscribe(sub.streamId)
        } else if (sub.getState() !== Subscription.State.unsubscribing) {
            // Else the sub can be cleaned off immediately
            this._removeSubscription(sub)
            sub.setState(Subscription.State.unsubscribed)
            this._checkAutoDisconnect()
        }
    }

    unsubscribeAll(streamId) {
        if (!streamId) {
            throw new Error('unsubscribeAll: a stream id is required!')
        } else if (typeof streamId !== 'string') {
            throw new Error('unsubscribe: stream id must be a string!')
        }

        if (this.subsByStream[streamId]) {
            // Copy the list to avoid concurrent modifications
            const l = this.subsByStream[streamId].slice()
            l.forEach((sub) => {
                this.unsubscribe(sub)
            })
        }
    }

    isConnected() {
        return this.connected
    }

    reconnect() {
        return this.connect(true)
    }

    connect() {
        if (this.connected) {
            debug('connect() called while already connected, doing nothing...')
            return
        } else if (this.connecting) {
            debug('connect() called while connecting, doing nothing...')
            return
        }

        debug('Connecting to %s', this.options.url)
        this.connecting = true
        this.disconnecting = false

        this.connection = new Connection(this.options)

        // Broadcast messages to all subs listening on stream
        this.connection.on('b', (msg) => {
            // Notify the Subscriptions for this stream. If this is not the message each individual Subscription
            // is expecting, they will either ignore it or request resend via gap event.
            const subs = this.subsByStream[msg.streamId]
            if (subs) {
                for (let i = 0; i < subs.length; i++) {
                    subs[i].handleMessage(msg, false)
                }
            } else {
                debug('WARN: message received for stream with no subscriptions: %s', msg.streamId)
            }
        })

        // Unicast messages to a specific subscription only
        this.connection.on('u', (msg, sub) => {
            if (sub !== undefined && this.subById[sub] !== undefined) {
                this.subById[sub].handleMessage(msg, true)
            } else {
                debug('WARN: subscription not found for stream: %s, sub: %s', msg.streamId, sub)
            }
        })

        this.connection.on('subscribed', (response) => {
            if (response.error) {
                this.handleError(`Error subscribing to ${response.stream}: ${response.error}`)
            } else {
                const subs = this.subsByStream[response.stream]

                // The typeof array === 'object'
                if (subs && typeof subs === 'object') {
                    delete subs.subscribing
                    // Report subscribed to all non-resending Subscriptions for this stream
                    subs.filter((sub) => !sub.resending)
                        .forEach((sub) => {
                            sub.setState(Subscription.State.subscribed)
                        })
                }

                debug('Client subscribed: %o', response)
            }
        })

        this.connection.on('unsubscribed', (response) => {
            debug('Client unsubscribed: %o', response)

            if (this.subsByStream[response.stream]) {
                // Copy the list to avoid concurrent modifications
                const l = this.subsByStream[response.stream].slice()
                l.forEach((sub) => {
                    this._removeSubscription(sub)
                    sub.setState(Subscription.State.unsubscribed)
                })
            }

            this._checkAutoDisconnect()
        })

        // Route resending state messages to corresponding Subscriptions
        this.connection.on('resending', (response) => {
            if (this.subById[response.sub]) {
                this.subById[response.sub].emit('resending', response)
            } else {
                debug('resent: Subscription %d is gone already', response.sub)
            }
        })

        this.connection.on('no_resend', (response) => {
            if (this.subById[response.sub]) {
                this.subById[response.sub].emit('no_resend', response)
            } else {
                debug('resent: Subscription %d is gone already', response.sub)
            }
        })

        this.connection.on('resent', (response) => {
            if (this.subById[response.sub]) {
                this.subById[response.sub].emit('resent', response)
            } else {
                debug('resent: Subscription %d is gone already', response.sub)
            }
        })

        // On connect/reconnect, send pending subscription requests
        this.connection.on('connected', () => {
            debug('Connected!')
            this.connected = true
            this.connecting = false
            this.disconnecting = false
            this.emit('connected')

            Object.keys(this.subsByStream)
                .forEach((streamId) => {
                    const subs = this.subsByStream[streamId]
                    subs.forEach((sub) => {
                        if (sub.getState() !== Subscription.State.subscribed) {
                            this._resendAndSubscribe(sub)
                        }
                    })
                })
        })

        this.connection.on('disconnected', () => {
            debug('Disconnected.')
            this.connected = false
            this.connecting = false
            this.disconnecting = false
            this.emit('disconnected')

            Object.keys(this.subsByStream)
                .forEach((streamId) => {
                    const subs = this.subsByStream[streamId]
                    if (subs && typeof subs === 'object') {
                        delete subs.subscribing
                    }
                    subs.forEach((sub) => {
                        sub.setState(Subscription.State.unsubscribed)
                    })
                })
        })

        this.connection.connect()
    }

    pause() {
        this.connection.disconnect()
    }

    disconnect() {
        this.connecting = false
        this.disconnecting = true

        Object.keys(this.subsByStream)
            .forEach((streamId) => {
                this.unsubscribeAll(streamId)
            })

        this.connection.disconnect()
    }

    _checkAutoDisconnect() {
        // Disconnect if no longer subscribed to any streams
        if (this.options.autoDisconnect && Object.keys(this.subsByStream).length === 0) {
            debug('Disconnecting due to no longer being subscribed to any streams')
            this.disconnect()
        }
    }

    _resendAndSubscribe(sub) {
        if (sub.getState() !== Subscription.State.subscribing && !sub.resending) {
            sub.setState(Subscription.State.subscribing)
            this._requestSubscribe(sub)

            // Once subscribed, ask for a resend
            sub.once('subscribed', () => {
                if (sub.hasResendOptions()) {
                    this._requestResend(sub)
                }
            })
        }
    }

    _requestSubscribe(sub) {
        const subs = this.subsByStream[sub.streamId]

        const subscribedSubs = subs.filter((it) => it.getState() === Subscription.State.subscribed)

        // If this is the first subscription for this stream, send a subscription request to the server
        if (!subs.subscribing && subscribedSubs.length === 0) {
            const req = Object.assign({}, sub.options, {
                type: 'subscribe', stream: sub.streamId, authKey: sub.apiKey,
            })
            debug('_requestSubscribe: subscribing client: %o', req)
            subs.subscribing = true
            this.connection.send(req)
        } else if (subscribedSubs.length > 0) {
            // If there already is a subscribed subscription for this stream, this new one will just join it immediately
            debug('_requestSubscribe: another subscription for same stream: %s, insta-subscribing', sub.streamId)

            setTimeout(() => {
                sub.setState(Subscription.State.subscribed)
            })
        }
    }

    _requestUnsubscribe(streamId) {
        debug('Client unsubscribing stream %o', streamId)
        this.connection.send({
            type: 'unsubscribe',
            stream: streamId,
        })
    }

    _requestResend(sub, resendOptions) {
        // If overriding resendOptions are given, need to remove resend options in sub.options
        const options = Object.assign({}, sub.getEffectiveResendOptions())
        if (resendOptions) {
            Object.keys(options)
                .forEach((key) => {
                    if (key.match(/resend_.*/)) {
                        delete options[key]
                    }
                })
        }

        sub.setResending(true)

        const request = Object.assign({}, options, resendOptions, {
            type: 'resend', stream: sub.streamId, partition: sub.streamPartition, authKey: sub.apiKey, sub: sub.id,
        })
        debug('_requestResend: %o', request)
        this.connection.send(request)
    }

    handleError(msg) {
        debug(msg)
        this.emit('error', msg)
    }
}
