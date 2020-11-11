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
    constructor(client, opts, onFinally = () => {}) {
        super()
        this.client = client
        this.options = validateOptions(opts)
        this.key = this.options.key
        this.validate = opts.validate || Validator(client, this.options)
        this.pipeline = opts.pipeline || MessagePipeline(client, {
            ...this.options,
            validate: this.validate,
        }, onFinally)
        this.stream = this.pipeline.stream
    }

    async collect(n) {
        const msgs = []
        for await (const msg of this) {
            if (n === 0) {
                break
            }

            msgs.push(msg.getParsedContent())
            if (msgs.length === n) {
                break
            }
        }

        return msgs
    }

    [Symbol.asyncIterator]() {
        return this.pipeline
    }

    async cancel(...args) {
        return this.pipeline.cancel(...args)
    }

    async return(...args) {
        return this.pipeline.return(...args)
    }

    async throw(...args) {
        return this.pipeline.throw(...args)
    }

    async unsubscribe(...args) {
        return this.cancel(...args)
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

class SubscriptionSession extends Emitter {
    constructor(client, options) {
        super()
        this.client = client
        this.options = validateOptions(options)
        const { key } = this.options
        this.subscriptions = new Set()
        this.validate = Validator(client, this.options)
        this.deletedSubscriptions = new Set()
        const { connection } = this.client

        let deleted = new Set()
        this.step = pUpDownSteps([
            () => {
                this.emit('subscribing')
                return async () => {
                    this.isActive = false
                    try {
                        this.emit('unsubscribed')
                    } finally {
                        deleted.forEach((s) => {
                            this.deletedSubscriptions.delete(s)
                        })
                    }
                }
            },
            async () => {
                await connection.addHandle(key)
                return async () => {
                    deleted = new Set(this.deletedSubscriptions)
                    await connection.removeHandle(key)
                    return deleted
                }
            },
            async () => {
                await subscribe(this.client, this.options)
                this.emit('subscribed')
                return async () => {
                    this.emit('unsubscribing')
                    await unsubscribe(this.client, this.options)
                }
            }
        ], () => this.count())
    }

    has(sub) {
        return this.subscriptions.has(sub)
    }

    emit(...args) {
        const subs = this._getSubs()
        try {
            multiEmit(subs, ...args)
        } catch (error) {
            return super.emit('error', error)
        }

        return super.emit(...args)
    }

    _getSubs() {
        return new Set([
            ...this.deletedSubscriptions,
            ...this.subscriptions,
        ])
    }

    async add(sub) {
        this.subscriptions.add(sub)
        await this.step()
    }

    async remove(sub) {
        const cancelTask = sub.cancel()
        this.subscriptions.delete(sub)
        this.deletedSubscriptions.add(sub)
        await this.step()
        await cancelTask
    }

    count() {
        return this.subscriptions.size
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
        this.subSessions = new Map()
    }

    async add(opts, onFinally = () => {}) {
        const options = validateOptions(opts)
        const { key } = options
        const subSession = this.subSessions.get(key) || new SubscriptionSession(this.client, options)
        const sub = new Subscription(this.client, {
            ...options,
            validate: subSession.validate,
        }, async (err) => {
            try {
                await this.remove(sub)
            } finally {
                await onFinally(err)
            }
        })

        sub.count = () => {
            return this.count(options)
        }

        this.subSessions.set(key, subSession)

        try {
            await subSession.add(sub)
        } catch (err) {
            await this.remove(sub)
            throw err
        }

        return sub
    }

    async remove(sub) {
        const { key } = sub
        let cancelTask
        try {
            cancelTask = sub.cancel()
            const subSession = this.subSessions.get(key)
            if (subSession) {
                await subSession.remove(sub)
                if (!subSession.count()) {
                    this.subSessions.delete(key)
                }
            }
        } finally {
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
        this.subSessions.forEach((s) => {
            count += s.count()
        })
        return count
    }

    count(options) {
        if (options === undefined) { return this.countAll() }
        return this.get(options).length
    }

    getAll() {
        return [...this.subSessions.values()].reduce((o, s) => {
            o.push(...s.subscriptions)
            return o
        }, [])
    }

    getSubscriptionSession(options) {
        const { key } = validateOptions(options)
        return this.subSessions.get(key)
    }

    get(options) {
        if (options === undefined) { return this.getAll() }
        const { key } = validateOptions(options)
        const subSession = this.subSessions.get(key)
        if (!subSession) { return [] }
        return [...subSession.subscriptions]
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

    getSubscriptionSession(...args) {
        return this.subscriptions.getSubscriptionSession(...args)
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

    async subscribe(...args) {
        return this.subscriptions.add(...args)
    }

    async resend(opts) {
        const resendStream = getResendStream(this.client, opts)
        const sub = new Subscription(this.client, {
            pipeline: resendStream,
            ...opts,
        }, () => {
            sub.emit('resent')
        })
        resendStream.subscribe().catch(() => {})
        return sub
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

        let resendSubscribeSub

        const it = pipeline([
            async function* ResendSubIterator() {
                await resendSub.subscribe()
                // iterate over resend
                yield* resendSubscribeSub.resend
                resendSubscribeSub.emit('resent')
                // then iterate over realtime subscription
                yield* resendSubscribeSub.realtime
            },
        ], end)

        resendSubscribeSub = new Subscription(this.client, {
            pipeline: it,
            validate: sub.validate.bind(sub),
            ...options
        }, end)

        // attach additional utility functions
        return Object.assign(resendSubscribeSub, {
            get isActive() {
                return sub.isActive
            },
            realtime: sub,
            resend: resendSub,
        })
    }
}
