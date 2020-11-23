import Emitter from 'events'

import { allSettledValues, AggregatedError, pUpDownSteps, Defer, counterId } from '../utils'
import { pipeline } from '../utils/iterators'

import {
    validateOptions,
    subscribe,
    unsubscribe,
} from './api'
import MessagePipeline from './pipeline'
import Validator from './Validator'
import messageStream from './messageStream'
import resendStream from './resendStream'

export { validateOptions }

class Subscription extends Emitter {
    constructor(client, opts, onFinally = () => {}) {
        super()
        this._onDone = Defer()
        this.client = client
        this.options = validateOptions(opts)
        this.key = this.options.key
        this.id = counterId(`Subscription.${this.key}`)
        this._onFinally = onFinally
        this.onPipelineEnd = this.onPipelineEnd.bind(this)
        this.validate = opts.validate || Validator(client, this.options)
        this.pipeline = opts.pipeline || MessagePipeline(client, {
            ...this.options,
            validate: this.validate,
        }, this.onPipelineEnd)
        this.msgStream = this.pipeline.msgStream
    }

    async onPipelineEnd(err) {
        try {
            await this._onFinally(err)
        } finally {
            this._onDone.handleErrBack(err)
        }
    }

    async onDone() {
        return this._onDone
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
        if (this.iterated) {
            throw new Error('cannot iterate subscription more than once. Cannot iterate if message handler function was passed to subscribe.')
        }

        this.iterated = true
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
        let needsReset = false

        const onDisconnected = async () => {
            try {
                if (!connection.isConnectionValid()) {
                    await this.step()
                    return
                }

                needsReset = true
                await this.step()
                if (connection.isConnectionValid()) {
                    needsReset = false
                    await this.step()
                }
            } catch (err) {
                this.emit(err)
            }
        }

        let deleted = new Set()
        this.step = pUpDownSteps([
            () => {
                needsReset = false
                connection.on('done', onDisconnected)
                connection.on('disconnected', onDisconnected)
                connection.on('disconnecting', onDisconnected)
                this.emit('subscribing')
                return async () => {
                    connection.off('done', onDisconnected)
                    connection.off('disconnected', onDisconnected)
                    connection.off('disconnecting', onDisconnected)
                    if (needsReset) { return }
                    try {
                        this.emit('unsubscribed')
                    } finally {
                        deleted.forEach((s) => {
                            this.deletedSubscriptions.delete(s)
                        })
                    }
                    if (!connection.isConnectionValid()) {
                        await this.removeAll()
                    }
                }
            },
            async () => {
                await connection.addHandle(key)
                return async () => {
                    if (needsReset) { return }
                    deleted = new Set(this.deletedSubscriptions)
                    await connection.removeHandle(key)
                }
            },
            async () => {
                await connection.needsConnection(`Subscribe ${key}`)
            },
            async () => {
                await subscribe(this.client, this.options)
                this.emit('subscribed')
                return async () => {
                    if (needsReset) { return }
                    this.emit('unsubscribing')
                    await unsubscribe(this.client, this.options)
                }
            }
        ], () => (
            connection.isConnectionValid()
            && !needsReset
            && this.count()
        ))
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
        const { connection } = this.client
        await connection.addHandle(`adding${sub.id}`)
        try {
            await connection.needsConnection(`Subscribe ${sub.id}`)
            await this.step()
        } finally {
            await connection.removeHandle(`adding${sub.id}`)
        }
    }

    async remove(sub) {
        this.subscriptions.delete(sub)

        if (this.deletedSubscriptions.has(sub)) {
            return
        }

        const cancelTask = sub.cancel()
        this.subscriptions.delete(sub)
        this.deletedSubscriptions.add(sub)
        await this.step()
        await cancelTask
    }

    async removeAll() {
        const subs = this._getSubs()
        return Promise.all([...subs].map((sub) => (
            this.remove(sub)
        )))
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
            return this.count(sub.options)
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

    resend(opts, fn = () => {}) {
        const resendMsgStream = resendStream(this.client, opts)

        const sub = new Subscription(this.client, {
            msgStream: resendMsgStream,
            ...opts,
        }, async (...args) => {
            sub.emit('resent')
            await fn(...args)
        })
        resendMsgStream.subscribe().catch((err) => sub.cancel(err))
        return sub
    }

    async resendSubscribe(opts, onMessage) {
        // This works by passing a custom message stream to a subscription
        // the custom message stream iterates resends, then iterates realtime
        const options = validateOptions(opts)

        const resendMessageStream = resendStream(this.client, options)
        const realtimeMessageStream = messageStream(this.client.connection, options)

        // cancel both streams on end
        async function end(optionalErr) {
            await Promise.all([
                resendMessageStream.cancel(optionalErr),
                realtimeMessageStream.cancel(optionalErr),
            ])
        }

        let resendSubscribeSub

        let resentCount
        const it = pipeline([
            async function* HandleResends() {
                await resendMessageStream.subscribe()
                // Inconvience here
                // emitting the resent event is a bit tricky in this setup because the subscription
                // doesn't know anything about the source of the messages
                // can't emit resent immediately after resent stream end since
                // the message is not yet through the message pipeline
                //
                // Solution is to count number of resent messages
                // and emit resent once subscription has seen that many messages
                let count = 0
                for await (const msg of resendSubscribeSub.resend) {
                    count += 1
                    yield msg
                }

                resentCount = count
                if (resentCount === 0) {
                    // no resent
                    resendSubscribeSub.emit('resent')
                }
            },
            async function* ResendThenRealtime(src) {
                yield* src
                yield* resendSubscribeSub.realtime
            },
        ], end)

        let msgCount = 0
        resendSubscribeSub = await this.subscribe({
            ...options,
            afterSteps: [
                async function* detectEndOfResend(src) {
                    for await (const msg of src) {
                        try {
                            msgCount += 1
                            yield msg
                        } finally {
                            if (resentCount && msgCount === resentCount) {
                                resendSubscribeSub.emit('resent')
                            }
                        }
                    }
                },
            ],
            msgStream: it,
        }, onMessage)

        // attach additional utility functions
        return Object.assign(resendSubscribeSub, {
            realtime: realtimeMessageStream,
            resend: resendMessageStream,
        })
    }
}
