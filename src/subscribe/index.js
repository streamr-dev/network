import Emitter from 'events'

import { ControlLayer } from 'streamr-client-protocol'

import { allSettledValues, AggregatedError, pUpDownSteps } from '../utils'
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

class Subscription extends Emitter {
    static add() {
        this.count = this.count + 1 || 1
    }

    static remove() {
        this.count = Math.max(this.count - 1 || 0, 0)
    }

    constructor(client, opts, onFinally = () => {}) {
        super()
        this.constructor.add()
        this.client = client
        this.options = validateOptions(opts)
        this.validate = opts.validate || Validator(client, this.options)
        this.key = this.options.key
        this._onFinally = onFinally
        this.onFinally = this.onFinally.bind(this)
        this.iterator = this.listen()
    }

    async onFinally(err) {
        this.constructor.remove()
        await this._onFinally(err)
    }

    listen() {
        const { client, options, validate, onFinally } = this
        this.pipeline = MessagePipeline(client, {
            type: ControlMessage.TYPES.BroadcastMessage,
            ...options,
            validate,
        }, onFinally)
        this.stream = this.pipeline.stream
        return this.pipeline
    }

    count() {
        return this.constructor.count || 0
    }

    async collect() {
        const msgs = []
        for await (const msg of this) {
            msgs.push(msg.getParsedContent())
        }

        return msgs
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

/**
 * A Map of Sets
 * Each key (should) contain a set.
 */

class MapSet extends Map {
    setGet(key) {
        return this.get(key) || new Set()
    }

    setAdd(key, item) {
        const items = this.setGet(key)
        items.add(item)
        this.set(key, items)
        return this
    }

    setHas(key, item) {
        const items = this.get(key)
        return !!(items && items.has(item))
    }

    setDelete(key, item) {
        const items = this.setGet(key)
        items.delete(item)
        if (!items.size) {
            super.delete(key)
        } else {
            this.set(key, items)
        }
        return this
    }

    setClear(key) {
        const items = this.setGet(key)
        items.clear()
        return this
    }

    setSize(key) {
        return this.setGet(key).size
    }
}

function multiEmit(emitters, ...args) {
    const errs = []
    emitters.forEach((s) => {
        try {
            s.emit(...args)
        } catch (err) {
            errs.push(err)
        }
    })

    if (errs.length) {
        throw new AggregatedError(errs, `Error emitting event: ${args[0]}`)
    }
}

/**
 * Keeps track of subscriptions.
 * Sends Subscribe/Unsubscribe requests as needed.
 * Adds connection handles as needed.
 */

class Subscriptions {
    constructor(client) {
        this.client = client
        this.subscriptions = new MapSet()
        this.subTasks = new MapSet()
        this.deletedSubs = new MapSet()
    }

    sendEvent(options, ...args) {
        options = validateOptions(options) // eslint-disable-line no-param-reassign
        const subs = this.getSubs(options)
        return multiEmit(subs, ...args)
    }

    getSubs(options) {
        const { key } = options
        return new Set([
            ...this.deletedSubs.setGet(key),
            ...this.subscriptions.setGet(key),
        ])
    }

    setup(sub) {
        const { options } = sub
        const { key } = options
        if (!this.subTasks.has(key)) {
            const { connection } = this.client
            const next = pUpDownSteps([
                async () => {
                    this.sendEvent(options, 'subscribing')
                    await connection.addHandle(key)
                    return async () => {
                        await connection.removeHandle(key)
                        this.sendEvent(options, 'unsubscribed')
                        this.deletedSubs.delete(key)
                    }
                },
                async () => {
                    await subscribe(this.client, options)
                    this.sendEvent(options, 'subscribed')
                    return async () => {
                        this.sendEvent(options, 'unsubscribing')
                        await unsubscribe(this.client, options)
                    }
                }
            ], () => this.count(options))

            this.subTasks.set(key, next)
        }

        return this.subTasks.get(key)
    }

    async step(key) {
        const next = this.subTasks.get(key)
        if (typeof next === 'function') {
            await next()
        }
    }

    async add(sub) {
        try {
            const { key } = sub
            this.subscriptions.setAdd(key, sub)
            this.setup(sub)
            await this.step(key)
        } catch (err) {
            await this.remove(sub)
            throw err
        }
    }

    async remove(sub) {
        const { key } = sub
        let cancelTask
        try {
            cancelTask = sub.cancel()
            // remove from set
            this.subscriptions.setDelete(key, sub)
            this.deletedSubs.setAdd(key, sub)
        } finally {
            await this.step(key, sub)
            await cancelTask // only wait for cancel at end
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

export default class Subscriber {
    constructor(client) {
        this.client = client
        this.subscriptions = new Subscriptions(client)
    }

    getAll(...args) {
        return this.subscriptions.getAll(...args)
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
