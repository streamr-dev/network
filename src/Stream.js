import { PassThrough, Readable, finished } from 'stream'
import { promisify } from 'util'

import pMemoize from 'p-memoize'
import pLimit from 'p-limit'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import AbortController from 'node-abort-controller'

import { uuid } from './utils'

const pFinished = promisify(finished)

const {
    SubscribeRequest, UnsubscribeRequest, ControlMessage,
    ResendLastRequest, ResendFromRequest, ResendRangeRequest,
} = ControlLayer

const { MessageRef } = MessageLayer

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class AbortError extends Error {
    constructor(msg = '', ...args) {
        super(`The operation was aborted. ${msg}`, ...args)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

function validateOptions(optionsOrStreamId) {
    if (!optionsOrStreamId) {
        throw new Error('options is required!')
    }

    // Backwards compatibility for giving a streamId as first argument
    let options
    if (typeof optionsOrStreamId === 'string') {
        options = {
            streamId: optionsOrStreamId,
            streamPartition: 0,
        }
    } else if (typeof optionsOrStreamId === 'object') {
        // shallow copy
        options = {
            streamPartition: 0,
            ...optionsOrStreamId
        }
    } else {
        throw new Error(`options must be an object! Given: ${optionsOrStreamId}`)
    }

    if (!options.streamId) {
        throw new Error(`streamId must be set, given: ${optionsOrStreamId}`)
    }

    return options
}

const ResendResponses = [ControlMessage.TYPES.ResendResponseResending, ControlMessage.TYPES.ResendResponseNoResend]

const PAIRS = new Map([
    [ControlMessage.TYPES.SubscribeRequest, [ControlMessage.TYPES.SubscribeResponse]],
    [ControlMessage.TYPES.UnsubscribeRequest, [ControlMessage.TYPES.UnsubscribeResponse]],
    [ControlMessage.TYPES.ResendLastRequest, ResendResponses],
    [ControlMessage.TYPES.ResendFromRequest, ResendResponses],
    [ControlMessage.TYPES.ResendRangeRequest, ResendResponses],
])

async function waitForResponse({ connection, types, requestId }) {
    return new Promise((resolve, reject) => {
        let cleanup
        const onResponse = (res) => {
            if (res.requestId !== requestId) { return }
            // clean up err handler
            cleanup()
            resolve(res)
        }

        const onErrorResponse = (res) => {
            if (res.requestId !== requestId) { return }
            // clean up success handler
            cleanup()
            const error = new Error(res.errorMessage)
            error.code = res.errorCode
            reject(error)
        }

        cleanup = () => {
            types.forEach((type) => {
                connection.off(type, onResponse)
            })
            connection.off(ControlMessage.TYPES.ErrorResponse, onErrorResponse)
        }

        types.forEach((type) => {
            connection.on(type, onResponse)
        })
        connection.on(ControlMessage.TYPES.ErrorResponse, onErrorResponse)
    })
}

async function waitForRequestResponse(client, request) {
    return waitForResponse({
        connection: client.connection,
        types: PAIRS.get(request.type),
        requestId: request.requestId,
    })
}

function getIsMatchingStreamMessage({ streamId, streamPartition = 0 }) {
    return function isMatchingStreamMessage({ streamMessage }) {
        const msgStreamId = streamMessage.getStreamId()
        if (streamId !== msgStreamId) { return false }
        const msgPartition = streamMessage.getStreamPartition()
        if (streamPartition !== msgPartition) { return false }
        return true
    }
}

function pTimeout(p, ms, msg = '') {
    let t
    const start = Date.now()
    return (
        Promise.race([
            p.finally(() => {
                clearTimeout(t)
            }),
            new Promise(() => {
                t = setTimeout((resolve, reject) => {
                    reject(new Error(`timed out: ${Date.now() - start}ms > ${ms}ms. ${msg}`))
                })
            })
        ])
    )
}

async function subscribe(client, { streamId, streamPartition = 0 }) {
    const sessionToken = await client.session.getSessionToken()
    const request = new SubscribeRequest({
        streamId,
        streamPartition,
        sessionToken,
        requestId: uuid('sub'),
    })

    const onResponse = waitForRequestResponse(client, request)

    await client.send(request)
    return onResponse
}

async function unsubscribe(client, { streamId, streamPartition = 0 }) {
    const sessionToken = await client.session.getSessionToken()
    const request = new UnsubscribeRequest({
        streamId,
        streamPartition,
        sessionToken,
        requestId: uuid('unsub'),
    })

    const onResponse = waitForRequestResponse(client, request)

    await client.send(request)
    return onResponse
}

/**
 * Allows injecting a function to execute after an iterator finishes.
 * Executes finally function even if generator not started.
 */

function iteratorFinally(iterator, onFinally = () => {}) {
    let started = false
    const g = (async function* It() {
        started = true
        try {
            yield* iterator
        } finally {
            await onFinally(iterator)
        }
    }())

    // overrides return/throw to call onFinally even if generator was never started
    const oldReturn = g.return
    g.return = async (...args) => {
        if (!started) {
            await onFinally(iterator)
        }
        return oldReturn.call(g, ...args)
    }
    const oldThrow = g.throw
    g.throw = async (...args) => {
        if (!started) {
            await onFinally(iterator)
        }
        return oldThrow.call(g, ...args)
    }
    return g
}

function addBeforeDestroy(stream) {
    const d = stream.destroy.bind(stream)
    const destroyFns = new Set()
    // eslint-disable-next-line no-param-reassign
    stream.destroy = async (...args) => {
        if (!destroyFns || !destroyFns.size) {
            return d(...args)
        }
        try {
            for (const fn of destroyFns) {
                // eslint-disable-next-line no-await-in-loop
                await fn()
            }
        } catch (error) {
            return d(error, ...args.slice(1))
        } finally {
            destroyFns.clear()
        }

        return d(...args)
    }

    // eslint-disable-next-line no-param-reassign
    stream.beforeDestroy = (fn) => {
        destroyFns.add(fn)
    }

    // eslint-disable-next-line no-param-reassign
    stream.throw = async (err) => {
        const it = stream[Symbol.asyncIterator]()
        await it.throw(err)
        await pFinished(stream)
    }

    // eslint-disable-next-line no-param-reassign
    stream.return = async () => {
        // little trick to ensure stream cleaned up
        // iterator.return won't exit until destroy handler finished
        const it = stream[Symbol.asyncIterator]()
        await it.return()
        await stream.destroy()
        await pFinished(stream)
    }

    return stream
}

function messageStream(client, { streamId, streamPartition, signal, type = ControlMessage.TYPES.BroadcastMessage }) {
    if (signal && signal.aborted) {
        throw new AbortError()
    }

    const queue = addBeforeDestroy(new PassThrough({
        objectMode: true,
    }))

    const onAbort = () => {
        return queue.destroy(new AbortError())
    }

    if (signal) {
        signal.addEventListener('abort', onAbort, {
            once: true
        })
    }

    const isMatchingStreamMessage = getIsMatchingStreamMessage({
        streamId,
        streamPartition
    })

    const onMessage = (msg) => {
        if (isMatchingStreamMessage(msg)) {
            queue.write(msg)
        }
    }

    client.connection.on(type, onMessage)
    queue.once('close', () => {
        client.connection.off(type, onMessage)
        if (signal) {
            signal.removeEventListener('abort', onAbort, {
                once: true,
            })
        }
    })
    return queue
}

function SubKey({ streamId, streamPartition = 0 }) {
    if (streamId == null) { throw new Error(`SubKey: invalid streamId: ${streamId} ${streamPartition}`) }
    return `${streamId}|${streamPartition}`
}

class Subscription {
    constructor(client, options) {
        this.client = client
        this.options = validateOptions(options)
        this.abortController = new AbortController()
        this.streams = new Set()

        this.queue = pLimit(1)
        const sub = this.subscribe.bind(this)
        const unsub = this.unsubscribe.bind(this)
        this.subscribe = () => this.queue(sub)
        this.unsubscribe = () => this.queue(unsub)
        this.sendSubscribe = pMemoize(this.sendSubscribe.bind(this))
        this.sendUnsubscribe = pMemoize(this.sendUnsubscribe.bind(this))
    }

    hasPending() {
        return !!(this.queue.activeCount || this.queue.pendingCount)
    }

    async abort() {
        this.abortController.abort()
        await this.queue(() => {}) // pending tasks done
    }

    async sendSubscribe() {
        return subscribe(this.client, this.options)
    }

    async sendUnsubscribe() {
        return unsubscribe(this.client, this.options)
    }

    async subscribe() {
        pMemoize.clear(this.sendUnsubscribe)
        await this.sendSubscribe()
        return this.iterate()
    }

    async unsubscribe() {
        pMemoize.clear(this.sendSubscribe)
        await this.sendUnsubscribe()
    }

    async return() {
        await Promise.all([...this.streams].map(async (stream) => {
            await stream.return()
        }))
    }

    async _cleanup(stream) {
        // if stream never started, finally block never called, thus need to manually clean it
        this.streams.delete(stream)
        if (!this.streams.size) {
            // unsubscribe if no more streams
            await this.unsubscribe()
        }
    }

    count() {
        return this.streams.size
    }

    iterate() {
        const stream = messageStream(this.client, {
            signal: this.abortController.signal,
            ...this.options,
            type: ControlMessage.TYPES.BroadcastMessage,
        })
        stream.beforeDestroy(async () => {
            await this._cleanup(stream)
        })
        this.streams.add(stream)
        return stream
    }

    [Symbol.asyncIterator]() {
        return this.iterate()
    }
}

function createResendRequest({
    requestId = uuid('rs'),
    streamId,
    streamPartition = 0,
    publisherId,
    msgChainId,
    sessionToken,
    ...options
}) {
    let request
    const opts = {
        streamId,
        streamPartition,
        requestId,
        sessionToken,
    }

    if (options.last > 0) {
        request = new ResendLastRequest({
            ...opts,
            numberLast: options.last,
        })
    } else if (options.from && !options.to) {
        request = new ResendFromRequest({
            ...opts,
            fromMsgRef: new MessageRef(options.from.timestamp, options.from.sequenceNumber),
            publisherId,
            msgChainId,
        })
    } else if (options.from && options.to) {
        request = new ResendRangeRequest({
            ...opts,
            fromMsgRef: new MessageRef(options.from.timestamp, options.from.sequenceNumber),
            toMsgRef: new MessageRef(options.to.timestamp, options.to.sequenceNumber),
            publisherId,
            msgChainId,
        })
    }

    if (!request) {
        throw new Error("Can't _requestResend without resend options")
    }
    return request
}

async function resend(client, options) {
    const sessionToken = await client.session.getSessionToken()
    const request = createResendRequest({
        ...options,
        sessionToken,
    })

    const onResponse = waitForRequestResponse(client, request)

    await client.send(request)
    return onResponse
}

export default class Subscriptions {
    constructor(client) {
        this.client = client
        this.subscriptions = new Map()
    }

    get(options) {
        const key = SubKey(validateOptions(options))
        return this.subscriptions.get(key)
    }

    abort(options) {
        const sub = this.get(options)
        return sub && sub.abort()
    }

    count(options) {
        const sub = this.get(options)
        return sub ? sub.count() : 0
    }

    async subscribe(options) {
        const key = SubKey(validateOptions(options))
        const sub = (
            this.subscriptions.get(key)
            || this.subscriptions.set(key, new Subscription(this.client, options)).get(key)
        )

        return sub.subscribe()
    }

    async unsubscribe(options) {
        const key = SubKey(validateOptions(options))
        const sub = this.subscriptions.get(key)
        if (!sub) { return }

        // wait for any outstanding operations
        if (sub.hasPending()) {
            await sub.queue(() => {})
        }

        await sub.return() // close all streams (thus unsubscribe)
    }

    async resend(opts) {
        const options = validateOptions(opts)
        const stream = messageStream(this.client, {
            ...options,
            type: ControlMessage.TYPES.UnicastMessage,
        })

        const requestId = uuid('rs')
        // eslint-disable-next-line promise/catch-or-return
        const onResendDone = waitForResponse({
            connection: this.client.connection,
            types: [
                ControlMessage.TYPES.ResendResponseResent,
                ControlMessage.TYPES.ResendResponseNoResend,
            ],
            requestId,
        }).then(() => {
            // close off resend
            return stream.push(null)
        }, (err) => {
            return stream.throw(err)
        })

        await Promise.race([
            resend(this.client, {
                requestId,
                ...options,
            }),
            onResendDone
        ])

        return stream
    }

    async resendSubscribe(options) {
        const [sub, resendSub] = await Promise.all([
            this.subscribe(options),
            this.resend(options),
        ])

        const it = iteratorFinally((async function* ResendSubIterator() {
            yield* resendSub
            yield* sub
        }()), async () => {
            await Promise.all([
                resendSub.return(),
                sub.return(),
            ])
        })
        const stream = addBeforeDestroy(Readable.from(it))
        stream.beforeDestroy(async () => {
            await Promise.all([
                resendSub.return(),
                sub.return(),
            ])
        })

        return stream
    }
}
