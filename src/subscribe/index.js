import Emitter from 'events'

import pMemoize from 'p-memoize'
import pLimit from 'p-limit'
import { ControlLayer } from 'streamr-client-protocol'

import { allSettledValues, LimitAsyncFnByKey } from '../utils'
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

class Subscription {
    static add() {
        this.count = this.count + 1 || 1
    }

    static remove() {
        this.count = Math.max(this.count - 1 || 0, 0)
    }

    count() {
        return this.constructor.count || 0
    }

    constructor(client, opts, onFinally = () => {}) {
        this.client = client
        this.options = validateOptions(opts)
        this.key = this.options.key
        this._onFinally = onFinally
        this.onFinally = this.onFinally.bind(this)
        this.iterator = this.listen()
    }

    async onFinally(err) {
        await this._onFinally(err)
    }

    listen() {
        const { client, options, onFinally } = this
        const validate = Validator(client, options)
        return MessagePipeline(client, {
            validate,
            type: ControlMessage.TYPES.BroadcastMessage,
            ...options,
        }, onFinally)
    }

    [Symbol.asyncIterator]() {
        return this.iterator
    }

    async cancel(...args) {
        return this.iterator.cancel(...args)
    }

    async return(...args) {
        return this.iterator.return(...args)
    }

    async throw(...args) {
        return this.iterator.throw(...args)
    }

    async unsubscribe(...args) {
        return this.cancel(...args)
    }
}

class SubscriptionManager {
    constructor(client) {
        this.client = client
        this.subscriptions = new Map()
        this.queue = LimitAsyncFnByKey(1)
    }

    _subscribe(options) {
        const { key } = options
        return this.queue(key, async () => {
            if (!this.count(options)) { return }
            await subscribe(this.client, options)
        })
    }

    _unsubscribe(options) {
        const { key } = options
        return this.queue(key, async () => {
            if (this.count(options)) { return }
            await unsubscribe(this.client, options)
        })
    }

    async add(sub) {
        try {
            const { key, options } = sub
            const isNew = !this.subscriptions.has(key)
            const subs = isNew ? new Set() : this.subscriptions.get(key)
            subs.add(sub)
            this.subscriptions.set(key, subs)
            const { connection } = this.client
            await connection.addHandle(key)
            if (isNew && this.count(options)) {
                await this._subscribe(options)
            }
        } catch (err) {
            await this.remove(sub)
            throw err
        }
    }

    async remove(sub) {
        const { key, options } = sub
        const hadSub = this.subscriptions.has(key)
        let cancelTask
        try {
            if (!hadSub) { return }
            cancelTask = sub.cancel()
            const subs = this.subscriptions.get(key)
            subs.delete(sub)
            if (subs.size) {
                this.subscriptions.set(key, subs)
            } else {
                this.subscriptions.delete(key)
            }
            const { connection } = this.client

            if (!this.count(options)) {
                await connection.removeHandle(key)
            }
        } finally {
            if (hadSub && !this.count(options)) {
                await this._unsubscribe(options)
            }
            await cancelTask
        }
    }

    async removeAll(options) {
        const subs = this.get(options)
        return allSettledValues(subs.map((sub) => (
            this.remove(sub)
        )))
    }

    countAll() {
        let count = 0
        this.subscriptions.forEach((s) => {
            count += s.size
        })
        return count
    }

    count(options) {
        if (options === undefined) { return this.countAll() }
        return this.get(options).length
    }

    getAll() {
        return [this.subscriptions].reduce((o, s) => {
            o.push(...s)
            return o
        }, [])
    }

    get(options) {
        if (options === undefined) { return this.getAll() }
        const { key } = validateOptions(options)
        return [...(this.subscriptions.get(key) || new Set())]
    }
}

/**
 * Top-level interface for creating/destroying subscriptions.
 */

export default class Subscriptions {
    constructor(client) {
        this.client = client
        this.subscriptions = new SubscriptionManager(client)
    }

    count(options) {
        return this.subscriptions.count(options)
    }

    async unsubscribe(options) {
        if (options instanceof Subscription) {
            const sub = options
            return sub.cancel()
        }

        if (options && options.options) {
            return this.unsubscribe(options.options)
        }

        return this.subscriptions.removeAll(options)
    }

    async subscribe(options, onFinally = () => {}) {
        const sub = new Subscription(this.client, options, async (err) => {
            try {
                await this.subscriptions.remove(sub)
            } finally {
                await onFinally(err)
            }
        })

        await this.subscriptions.add(sub)

        return sub
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
