import Emitter from 'events'

import { allSettledValues, AggregatedError, Scaffold, Defer, counterId } from '../utils'
import { pipeline } from '../utils/iterators'
import { validateOptions } from '../stream/utils'
import { ConnectionError } from '../Connection'

import { subscribe, unsubscribe } from './api'
import MessagePipeline from './pipeline'
import Validator from './Validator'
import messageStream from './messageStream'
import resendStream from './resendStream'
import { Todo, MaybeAsync } from '../types'
import StreamrClient, { StreamPartDefinition, SubscribeOptions } from '..'

async function defaultOnFinally(err?: Error) {
    if (err) {
        throw err
    }
}

/**
 * @category Important
 */
export class Subscription extends Emitter {

    streamId: string
    streamPartition: number
    /** @internal */
    client: StreamrClient
    /** @internal */
    options: ReturnType<typeof validateOptions> & {
        id?: string
    }
    /** @internal */
    key
    /** @internal */
    id
    /** @internal */
    _onDone: ReturnType<typeof Defer>
    /** @internal */
    _onFinally
    /** @internal */
    pipeline: ReturnType<typeof MessagePipeline>
    /** @internal */
    msgStream
    /** @internal */
    iterated = false
    /** @internal */
    debug

    constructor(client: StreamrClient, opts: Todo, onFinally: MaybeAsync<(err?: any) => void> = defaultOnFinally) {
        super()
        this.client = client
        this.options = validateOptions(opts)
        this.key = this.options.key
        this.id = counterId(`Subscription:${this.options.id || ''}${this.key}`)
        this.debug = client.debug.extend(this.id)
        this.debug('create')
        this.streamId = this.options.streamId
        this.streamPartition = this.options.streamPartition

        this._onDone = Defer()
        this._onDone.catch(() => {}) // prevent unhandledrejection
        this._onFinally = onFinally

        const validate = opts.validate || Validator(client, this.options)
        this.onPipelineEnd = this.onPipelineEnd.bind(this)
        this.pipeline = opts.pipeline || MessagePipeline(client, {
            ...this.options,
            validate,
            onError: (err: Error) => {
                this.emit('error', err)
            },
        }, this.onPipelineEnd)

        this.msgStream = this.pipeline.msgStream
    }

    emit(event: symbol | string, ...args: any[]) {
        if (event !== 'error') {
            return super.emit(event, ...args)
        }
        const [error] = args

        if (!this.listenerCount('error')) {
            this.debug('emitting error but no error listeners, cancelling subscription', error)
            this.cancel(error)
            return false
        }
        try {
            this.debug('emit error', error)
            return super.emit('error', ...args)
        } catch (err) {
            if (err !== error) {
                this.debug('error emitting error!', err)
            }
            this.cancel(err)
            return false
        }
    }

    /**
     * Expose cleanup
     * @internal
     */

    async onPipelineEnd(err?: Error) {
        this.debug('onPipelineEnd', err)
        let error = err
        try {
            await this._onFinally(error)
        } catch (onFinallyError) {
            error = AggregatedError.from(error, onFinallyError)
        } finally {
            this._onDone.handleErrBack(error)
        }
    }

    /** @internal */
    async onDone() {
        return this._onDone
    }

    /**
     * Collect all messages into an array.
     * Returns array when subscription is ended.
     */
    async collect(n?: number) {
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
        // only iterate sub once
        if (this.iterated) {
            throw new Error('cannot iterate subscription more than once. Cannot iterate if message handler function was passed to subscribe.')
        }

        this.iterated = true
        return this.pipeline
    }

    async cancel(...args: Todo[]) {
        return this.pipeline.cancel(...args)
    }

    async return(...args: Todo[]) {
        return this.pipeline.return(...args)
    }

    async throw(...args: Todo[]) {
        return this.pipeline.throw(...args)
    }

    /**
     * Remove this subscription from the stream.
     */
    async unsubscribe() {
        return this.cancel()
    }
}

/**
 * Emit event on all supplied emitters.
 * Aggregates errors rather than throwing on first.
 */

function multiEmit(emitters: Todo, ...args: Todo[]) {
    let error: Todo
    emitters.forEach((s: Todo) => {
        try {
            s.emit(...args)
        } catch (err) {
            AggregatedError.from(error, err, `Error emitting event: ${args[0]}`)
        }
    })

    if (error) {
        throw error
    }
}

/**
 * Sends Subscribe/Unsubscribe requests as needed.
 * Adds connection handles as needed.
 */

class SubscriptionSession extends Emitter {
    id
    debug
    client: StreamrClient
    options: ReturnType<typeof validateOptions> & {
        id: string
        subscribe: typeof subscribe
        unsubscribe: typeof unsubscribe
    }
    validate
    subscriptions: Set<Subscription>
    deletedSubscriptions: Set<Todo>
    step?: Todo
    _subscribe
    _unsubscribe

    constructor(client: StreamrClient, options: Todo) {
        super()
        this.client = client
        this.options = validateOptions(options)
        this.validate = Validator(client, this.options)
        this._subscribe = this.options.subscribe || subscribe
        this._unsubscribe = this.options.unsubscribe || unsubscribe

        this.subscriptions = new Set() // active subs
        this.deletedSubscriptions = new Set() // hold so we can clean up
        this.id = counterId(`SubscriptionSession:${this.options.id || ''}${this.options.key}`)
        this.debug = this.client.debug.extend(this.id)
        this.debug('create')
        this._init()
    }

    _init() {
        const { key } = this.options
        const { connection } = this.client

        let needsReset = false
        const onDisconnected = async () => {
            // see if we should reset then retry connecting
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
                this.emit('error', err)
            }
        }

        let deleted = new Set()
        const check = () => {
            return (
                connection.isConnectionValid()
                && !needsReset
                // has some active subscription
                && this.count()
            )
        }

        this.step = Scaffold([
            () => {
                needsReset = false
                return async () => {
                    // don't clean up if just resetting
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
            // add handlers for connection close events
            () => {
                connection.on('done', onDisconnected)
                connection.on('disconnected', onDisconnected)
                connection.on('disconnecting', onDisconnected)
                this.emit('subscribing')

                return () => {
                    connection.off('done', onDisconnected)
                    connection.off('disconnected', onDisconnected)
                    connection.off('disconnecting', onDisconnected)
                }
            },
            // open connection
            async () => {
                await connection.addHandle(key)
                return async () => {
                    if (needsReset) { return } // don't close connection if just resetting
                    deleted = new Set(this.deletedSubscriptions)
                    await connection.removeHandle(key)
                }
            },
            // validate connected
            async () => {
                await connection.needsConnection(`Subscribe ${key}`)
            },
            // subscribe
            async () => {
                await this._subscribe(this.client, this.options)
                this.emit('subscribed')

                return async () => {
                    if (needsReset) { return }
                    this.emit('unsubscribing')
                    await this._unsubscribe(this.client, this.options)
                }
            }
        // @ts-expect-error
        ], check, {
            onError(err) {
                if (err instanceof ConnectionError && !check()) {
                    // ignore error if state changed
                    needsReset = true
                    return
                }
                throw err
            }
        })
    }

    has(sub: Todo) {
        return this.subscriptions.has(sub)
    }

    /**
     * Emit message on every subscription,
     * then on self.
     */

    emit(...args: Todo[]) {
        const subs = this._getSubs()
        if (args[0] === 'error') {
            this.debug(args[0], args[1])
        } else {
            this.debug(args[0])
        }

        try {
            multiEmit(subs, ...args)
        } catch (error) {
            return super.emit('error', error)
        }
        // @ts-expect-error
        return super.emit(...args)
    }

    _getSubs() {
        // all known subs
        return new Set([
            ...this.deletedSubscriptions,
            ...this.subscriptions,
        ])
    }

    /**
     * Add subscription & appropriate connection handle.
     */

    async add(sub: Todo) {
        this.subscriptions.add(sub)
        this.debug('add', sub && sub.id)
        const { connection } = this.client
        await connection.addHandle(`adding${sub.id}`)
        try {
            await connection.needsConnection(`Subscribe ${sub.id}`)
            await this.step()
        } finally {
            await connection.removeHandle(`adding${sub.id}`)
        }
    }

    /**
     * Remove subscription & appropriate connection handle.
     */

    async remove(sub: Todo) {
        this.subscriptions.delete(sub)

        if (this.deletedSubscriptions.has(sub)) {
            return
        }

        if (this.subscriptions.has(sub)) {
            this.debug('remove', sub && sub.id)
        }

        const cancelTask = sub.cancel()
        try {
            this.subscriptions.delete(sub)
            this.deletedSubscriptions.add(sub)
            await this.step()
        } finally {
            await cancelTask
        }
    }

    /**
     * Remove all subscriptions & subscription connection handles
     */

    async removeAll() {
        const subs = this._getSubs()
        return Promise.all([...subs].map((sub) => (
            this.remove(sub)
        )))
    }

    /**
     * How many subscriptions
     */

    count() {
        return this.subscriptions.size
    }
}

/**
 * Keeps track of subscriptions.
 */

class Subscriptions {
    client: StreamrClient
    subSessions: Map<Todo, Todo>

    constructor(client: StreamrClient) {
        this.client = client
        this.subSessions = new Map()
    }

    async add(opts: StreamPartDefinition, onFinally: MaybeAsync<(err?: any) => void> = defaultOnFinally) {
        const options = validateOptions(opts)
        const { key } = options

        // get/create subscription session
        // don't add SubscriptionSession to subSessions until after subscription successfully created
        const subSession = this.subSessions.get(key) || new SubscriptionSession(this.client, options)

        // create subscription
        const sub = new Subscription(this.client, {
            ...options,
            validate: subSession.validate,
        }, async (err: Todo) => {
            try {
                await this.remove(sub)
            } finally {
                await onFinally(err)
            }
        })

        // @ts-expect-error
        sub.count = () => {
            // sub.count() gives number of subs on same stream+partition
            return this.count(sub.options)
        }

        // sub didn't throw, add subsession
        if (!this.subSessions.has(key)) { // double-check
            this.subSessions.set(key, subSession)
        }

        // add subscription to subSession
        try {
            await subSession.add(sub)
        } catch (err) {
            // clean up if fail
            await this.remove(sub)
            throw err
        }

        return sub
    }

    async remove(sub: Todo) {
        const { key } = sub
        let cancelTask
        try {
            cancelTask = sub.cancel()
            const subSession = this.subSessions.get(key)

            if (subSession) {
                await subSession.remove(sub)
                // remove subSession if no more subscriptions
                if (!subSession.count()) {
                    this.subSessions.delete(key)
                }
            }
        } finally {
            await cancelTask // only wait for cancel at end
        }
    }

    /**
     * Remove all subscriptions, optionally only those matching options.
     */
    async removeAll(options?: StreamPartDefinition) {
        const subs = this.get(options)
        return allSettledValues(subs.map((sub: Todo) => (
            this.remove(sub)
        )))
    }

    /**
     * Count all subscriptions.
     */

    countAll() {
        let count = 0
        this.subSessions.forEach((s) => {
            count += s.count()
        })
        return count
    }

    /**
     * Count all matching subscriptions.
     */

    count(options?: StreamPartDefinition) {
        if (options === undefined) { return this.countAll() }
        return this.get(options).length
    }

    /**
     * Get all subscriptions.
     */

    getAll() {
        return [...this.subSessions.values()].reduce((o, s) => {
            o.push(...s.subscriptions)
            return o
        }, [])
    }

    /**
     * Get subscription session for matching sub options.
     */

    getSubscriptionSession(options: Todo) {
        const { key } = validateOptions(options)
        return this.subSessions.get(key)
    }

    /**
     * Get all subscriptions matching options.
     */

    get(options?: StreamPartDefinition) {
        if (options === undefined) { return this.getAll() }

        const { key } = validateOptions(options)
        const subSession = this.subSessions.get(key)
        if (!subSession) { return [] }

        return [...subSession.subscriptions]
    }
}

type StreamOptions = Subscription | StreamPartDefinition | { options: Subscription|StreamPartDefinition }

/**
 * Top-level user-facing interface for creating/destroying subscriptions.
 */
export class Subscriber {

    client: StreamrClient
    subscriptions: Subscriptions

    constructor(client: StreamrClient) {
        this.client = client
        this.subscriptions = new Subscriptions(client)
    }

    getSubscriptionSession(...args: Todo[]) {
        // @ts-expect-error
        return this.subscriptions.getSubscriptionSession(...args)
    }

    get(opts: StreamPartDefinition) {
        return this.subscriptions.get(opts)
    }

    getAll() {
        return this.subscriptions.getAll()
    }

    count(options?: StreamPartDefinition) {
        return this.subscriptions.count(options)
    }

    async subscribe(opts: StreamPartDefinition, onFinally?: Todo) {
        return this.subscriptions.add(opts, onFinally)
    }

    async unsubscribe(options: StreamOptions): Promise<Todo> {
        if (options instanceof Subscription) {
            const sub = options
            return sub.cancel()
        }

        // @ts-expect-error
        if (options && options.options) {
            // @ts-expect-error
            return this.unsubscribe(options.options)
        }

        // @ts-expect-error
        return this.subscriptions.removeAll(options)
    }

    async resend(opts: Todo) {
        const resendMsgStream = resendStream(this.client, opts)

        const sub = new Subscription(this.client, {
            msgStream: resendMsgStream,
            ...opts,
        }, async (...args) => {
            sub.emit('resent')
            await sub.cancel(...args)
        })

        await resendMsgStream.subscribe()
        return sub
    }

    async resendSubscribe(opts: SubscribeOptions & StreamPartDefinition, onFinally?: MaybeAsync<(err?: any) => void>) {
        // This works by passing a custom message stream to a subscription
        // the custom message stream iterates resends, then iterates realtime
        const options = validateOptions(opts)

        const resendMessageStream = resendStream(this.client, options)
        // @ts-expect-error
        const realtimeMessageStream = messageStream(this.client.connection, options)

        // cancel both streams on end
        async function end(optionalErr?: Error) {
            const tasks = [
                resendMessageStream.cancel(optionalErr),
                realtimeMessageStream.cancel(optionalErr),
                resendSubscribeSub.cancel(optionalErr)
            ]

            await Promise.allSettled(tasks)
            await Promise.all(tasks)

            if (optionalErr) {
                throw optionalErr
            }
        }

        let resendSubscribeSub: Todo

        let lastResentMsgId: Todo
        let lastProcessedMsgId: Todo
        const resendDone = Defer()
        let isResendDone = false
        let resentEmitted = false

        function messageIDString(msg: Todo) {
            return msg.getMessageID().serialize()
        }

        function maybeEmitResend() {
            if (resentEmitted || !isResendDone) { return }

            // need to account for both cases:
            // resent finished after last message got through pipeline
            // resent finished before last message got through pipeline
            if (!lastResentMsgId || lastProcessedMsgId === lastResentMsgId) {
                lastResentMsgId = undefined
                resentEmitted = true
                resendSubscribeSub.emit('resent')
            }
        }

        const it = pipeline([
            async function* HandleResends() {
                try {
                    // Inconvience here
                    // emitting the resent event is a bit tricky in this setup because the subscription
                    // doesn't know anything about the source of the messages
                    // can't emit resent immediately after resent stream end since
                    // the message is not yet through the message pipeline
                    let currentMsgId
                    try {
                        for await (const msg of resendSubscribeSub.resend) {
                            currentMsgId = messageIDString(msg.streamMessage)
                            yield msg
                        }
                    } finally {
                        lastResentMsgId = currentMsgId
                    }
                } finally {
                    isResendDone = true
                    maybeEmitResend()
                    // @ts-expect-error
                    resendDone.resolve()
                }
            },
            async function* ResendThenRealtime(src: Todo) {
                yield* src
                await resendDone // ensure realtime doesn't start until resend ends
                yield* resendSubscribeSub.realtime
            },
        ], end)

        const resendTask = resendMessageStream.subscribe().catch((err) => {
            resendDone.reject(err)
            resendMessageStream.cancel(err)
            throw err
        })

        const realtimeTask = this.subscribe({
            ...options,
            // @ts-expect-error
            msgStream: it,
            afterSteps: [
                async function* detectEndOfResend(src: Todo) {
                    for await (const msg of src) {
                        const id = messageIDString(msg)
                        try {
                            yield msg
                        } finally {
                            lastProcessedMsgId = id
                            maybeEmitResend()
                        }
                    }
                },
            ],
        }, onFinally).then((sub) => {
            resendSubscribeSub = sub
            return sub
        })

        const tasks: Promise<any>[] = [
            realtimeTask,
            resendTask,
        ]

        try {
            await Promise.allSettled(tasks)
            await Promise.all(tasks)
        } catch (err) {
            await end()
            throw err
        }

        // attach additional utility functions
        return Object.assign(resendSubscribeSub, {
            realtime: realtimeMessageStream,
            resend: resendMessageStream,
        })
    }
}
