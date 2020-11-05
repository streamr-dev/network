import Emitter from 'events'

import pMemoize from 'p-memoize'
import pLimit from 'p-limit'
import { ControlLayer } from 'streamr-client-protocol'

import { allSettledValues } from '../utils'
import { pipeline } from '../utils/iterators'

import {
    validateOptions,
    subscribe,
    unsubscribe,
} from './api'
import {
    MessagePipeline,
    Validator,
    getResendStream,
} from './pipeline'

export { validateOptions }

const { ControlMessage } = ControlLayer

function emitterMixin(obj, emitter = new Emitter()) {
    return Object.assign(obj, {
        once: emitter.once.bind(emitter),
        emit: emitter.emit.bind(emitter),
        on: emitter.on.bind(emitter),
        off: emitter.off.bind(emitter),
        removeListener: emitter.removeListener.bind(emitter),
        addListener: emitter.addListener.bind(emitter),
        removeAllListeners: emitter.removeAllListeners.bind(emitter),
    })
}

/**
 * Manages creating iterators for a streamr stream.
 * When all iterators are done, calls unsubscribe.
 */

class Subscription extends Emitter {
    constructor(client, options, onFinal) {
        super()
        this.client = client
        this.onFinal = onFinal
        this.options = validateOptions(options)
        this.key = this.options.key
        this.streams = new Set()

        this.queue = pLimit(1)
        const sub = this._subscribe.bind(this)
        const unsub = this._unsubscribe.bind(this)
        this._subscribe = () => this.queue(sub)
        this._unsubscribe = () => this.queue(unsub)
        this.return = this.return.bind(this)
        this.sendSubscribe = pMemoize(this.sendSubscribe.bind(this))
        this.sendUnsubscribe = pMemoize(this.sendUnsubscribe.bind(this))
        this.validate = Validator(client, options)
        this._onConnected = this._onConnected.bind(this)
        this._onDisconnected = this._onDisconnected.bind(this)
        this._onDisconnecting = this._onDisconnecting.bind(this)
        this._onConnectionDone = this._onConnectionDone.bind(this)
        this._didSubscribe = false
        this.isActive = false
    }

    emit(...args) {
        // forward events to streams
        this.streams.forEach((s) => s.emit(...args))
        return super.emit(...args)
    }

    async _onConnected() {
        try {
            await this.sendSubscribe()
        } catch (err) {
            this.emit('error', err)
        }
    }

    async _onDisconnected() {
        // unblock subscribe
        pMemoize.clear(this.sendSubscribe)
    }

    async _onDisconnecting() {
        // otherwise should eventually reconnect
        if (!this.client.connection.isConnectionValid()) {
            await this.cancel()
        }
    }

    async _onConnectionDone() {
        await this.cancel()
    }

    hasPending() {
        return !!(this.queue.activeCount || this.queue.pendingCount)
    }

    async sendSubscribe() {
        this.emit('subscribing')
        await subscribe(this.client, this.options)
        this.emit('subscribed')
    }

    async sendUnsubscribe() {
        const { connection } = this.client
        // disconnection auto-unsubs, so if already disconnected/disconnecting no need to send unsub
        if (connection.isConnectionValid() && !connection.isDisconnected() && !connection.isDisconnecting()) {
            this.emit('unsubscribing')
            await unsubscribe(this.client, this.options)
            this.emit('unsubscribed')
        }
    }

    _cleanupHandlers() { // eslint-disable-line class-methods-use-this
        // noop will be replaced in subscribe
    }

    async _subscribe() {
        const { connection } = this.client
        try {
            pMemoize.clear(this.sendUnsubscribe)
            this._cleanupHandlers = connection.onTransition({
                connection: this.client.connection,
                onConnected: this._onConnected,
                onDisconnected: this._onDisconnected,
                onDisconnecting: this._onDisconnecting,
                onDone: this._onConnectionDone,
            })
            await connection.addHandle(this.key)
            await this.sendSubscribe()
            this._didSubscribe = true
        } catch (err) {
            await this._cleanupFinal()
            throw err
        }
    }

    async subscribe(onFinally) {
        this.isActive = true
        const iterator = this.iterate(onFinally) // start iterator immediately
        await this._subscribe()
        return iterator
    }

    async return() {
        this.isActive = false
        await allSettledValues([...this.streams].map(async (it) => {
            await it.return()
        }), 'return failed')
    }

    async unsubscribe(...args) {
        this.isActive = false
        return this._unsubscribe(...args)
    }

    async _unsubscribe(...args) {
        return this.cancel(...args)
    }

    async cancel(optionalErr) {
        this.isActive = false
        this._cleanupHandlers()
        if (this.hasPending()) {
            await this.queue(() => {})
        }
        await allSettledValues([...this.streams].map(async (it) => (
            it.cancel(optionalErr)
        )), 'cancel failed')
    }

    async _onSubscriptionDone() {
        const didSubscribe = !!this._didSubscribe
        pMemoize.clear(this.sendSubscribe)
        this._cleanupHandlers()
        await this.client.connection.removeHandle(this.key)
        if (!didSubscribe) { return }

        if (this.client.connection.isConnectionValid()) {
            await this.sendUnsubscribe()
        }
    }

    async _cleanupFinal() {
        // unsubscribe if no more streams
        await this._onSubscriptionDone()
        return this.onFinal()
    }

    async _cleanupIterator(it) {
        // if iterator never started, finally block never called, thus need to manually clean it
        const hadStream = this.streams.has(it)
        this.streams.delete(it)
        if (hadStream && !this.streams.size) {
            await this._cleanupFinal()
        }
    }

    count() {
        return this.streams.size
    }

    iterate(onFinally = () => {}) {
        const msgStream = MessagePipeline(this.client, {
            validate: this.validate,
            type: ControlMessage.TYPES.BroadcastMessage,
            ...this.options,
        }, async (err) => {
            await this._cleanupIterator(msgStream)
            await onFinally(err)
        })

        emitterMixin(msgStream) // forward subscription events to pipeline

        this.streams.add(msgStream)

        return Object.assign(msgStream, {
            count: this.count.bind(this),
            unsubscribe: this.unsubscribe.bind(this),
            subscribe: this.subscribe.bind(this),
        })
    }

    [Symbol.asyncIterator](fn) {
        return this.iterate(fn)
    }
}

/**
 * Top-level interface for creating/destroying subscriptions.
 */

export default class Subscriptions {
    constructor(client) {
        this.client = client
        this.subscriptions = new Map()
    }

    getAll(options) {
        if (options) {
            return [this.get(options)].filter(Boolean)
        }

        return [...this.subscriptions.values()]
    }

    get(options) {
        const { key } = validateOptions(options)
        return this.subscriptions.get(key)
    }

    count(options) {
        const sub = this.get(options)
        return sub ? sub.count() : 0
    }

    async unsubscribe(options) {
        if (options && options.options) {
            return this.unsubscribe(options.options)
        }

        const { key } = validateOptions(options)
        const sub = this.subscriptions.get(key)
        if (!sub) {
            return Promise.resolve()
        }

        this.subscriptions.delete(key)

        await sub.cancel() // close all streams (thus unsubscribe)
        return sub
    }

    _loadSubscription(options) {
        const { key } = validateOptions(options)
        let sub = this.subscriptions.get(key)
        if (!sub) {
            sub = new Subscription(this.client, options, () => {
                // clean up
                if (this.subscriptions.get(key) === sub) {
                    this.subscriptions.delete(key)
                }
            })
            this.subscriptions.set(key, sub)
        }

        return sub
    }

    async subscribe(options, onFinally) {
        const sub = this._loadSubscription(options)
        return sub.subscribe(onFinally)
    }

    async resend(opts) {
        return getResendStream(this.client, opts).subscribe()
    }

    async resendSubscribe(options) {
        // create realtime subscription
        const sub = await this.subscribe(options)
        const emitter = sub
        // create resend
        const resendSub = getResendStream(this.client, {
            emitter,
            ...options
        })

        // end both on end
        async function end(optionalErr) {
            await Promise.all([
                sub.cancel(optionalErr),
                resendSub.cancel(optionalErr),
            ])
        }

        const it = pipeline([
            async function* ResendSubIterator() {
                await resendSub.subscribe()
                // iterate over resend
                yield* it.resend
                emitter.emit('resent')
                // then iterate over realtime subscription
                yield* it.realtime
            },
        ], end)

        emitterMixin(it, emitter)

        // attach additional utility functions
        return Object.assign(it, {
            get isActive() {
                return sub.isActive
            },
            collect: sub.collect.bind(it),
            options,
            realtime: sub,
            resend: resendSub,
        })
    }
}
