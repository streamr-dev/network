import { PassThrough, finished } from 'stream'
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

export class AbortError extends Error {
    constructor(msg = '', ...args) {
        super(`The operation was aborted. ${msg}`, ...args)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

/**
 * Convert allSettled results into a thrown Aggregate error if necessary.
 */

async function allSettledValues(items, errorMessage) {
    const result = await Promise.allSettled(items)

    const errs = result.filter(({ status }) => status === 'rejected').map(({ reason }) => reason)
    if (errs.length) {
        const err = new Error([errorMessage, ...errs].filter(Boolean).join('\n'))
        err.errors = errs
        throw err
    }

    return result.map(({ value }) => value)
}

/**
 * Allows injecting a function to execute after an iterator finishes.
 * Executes finally function even if generator not started.
 */

function iteratorFinally(iterator, onFinally = () => {}) {
    let started = false
    const onFinallyOnce = pMemoize(onFinally)
    const g = (async function* It() {
        started = true
        try {
            yield* iterator
        } finally {
            await onFinallyOnce()
        }
    }())

    // overrides return/throw to call onFinally even if generator was never started
    const oldReturn = g.return
    const oldThrow = g.throw
    return Object.assign(g, {
        return: async (...args) => {
            if (!started) {
                await onFinallyOnce(iterator)
            }
            return oldReturn.call(g, ...args)
        },
        throw: async (...args) => {
            if (!started) {
                await onFinallyOnce()
            }
            return oldThrow.call(g, ...args)
        },
    })
}

/**
 * Iterates over a Stream
 * Cleans up stream/stops iterator if either stream or iterator ends.
 * Adds abort + end methods to iterator
 */

function streamIterator(stream, { abortController, onFinally = () => {}, }) {
    const onFinallyOnce = pMemoize(onFinally) // called once when stream ends
    const endStreamOnce = pMemoize(async (optionalErr) => {
        // ends stream + waits for end
        stream.destroy(optionalErr)
        await pFinished(stream, {
            // necessary or can get premature close errors
            // TODO: figure out why
            readable: false,
            writable: false,
        })
    })

    const it = iteratorFinally((async function* streamIteratorFn() {
        yield* stream
    }()), async () => {
        await endStreamOnce()
        await onFinallyOnce()
    })

    return Object.assign(it, {
        stream,
        async abort() {
            if (abortController) {
                abortController.abort()
            } else {
                await it.end(new AbortError())
            }
        },
        async end(optionalErr) {
            await endStreamOnce(optionalErr)

            if (optionalErr) {
                await it.throw(optionalErr)
                return
            }

            await it.return()
        }
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

/**
 * Listen for matching stream messages on connection.
 * Write messages into a Stream.
 */

function messageStream(connection, { streamId, streamPartition, signal, type = ControlMessage.TYPES.BroadcastMessage }) {
    if (signal && signal.aborted) {
        throw new AbortError()
    }

    // stream acts as buffer
    const msgStream = new PassThrough({
        objectMode: true,
    })

    const onAbort = () => {
        return msgStream.destroy(new AbortError())
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

    // write matching messages to stream
    const onMessage = (msg) => {
        if (!isMatchingStreamMessage(msg)) { return }
        msgStream.write(msg)
    }

    connection.on(type, onMessage)

    // remove onMessage handler & clean up as soon as we see any 'end' events
    const onClose = () => {
        connection.off(type, onMessage)
        // clean up abort signal
        if (signal) {
            signal.removeEventListener('abort', onAbort, {
                once: true,
            })
        }
        // clean up other handlers
        msgStream
            .off('close', onClose)
            .off('end', onClose)
            .off('destroy', onClose)
            .off('finish', onClose)
    }

    return msgStream
        .once('close', onClose)
        .once('end', onClose)
        .once('destroy', onClose)
        .once('finish', onClose)
}

export function validateOptions(optionsOrStreamId) {
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

/**
 * Wait for matching response types to requestId, or ErrorResponse.
 */

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

//
// Subscribe/Unsubscribe
//

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

//
// Resends
//

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

async function iterateResend(client, opts) {
    const options = validateOptions(opts)
    const abortController = new AbortController()
    const stream = messageStream(client.connection, {
        signal: abortController.signal,
        type: ControlMessage.TYPES.UnicastMessage,
        ...options,
    })

    const streamIt = streamIterator(stream, {
        abortController,
    })

    const requestId = uuid('rs')

    // wait for resend complete message(s)
    const onResendDone = waitForResponse({ // eslint-disable-line promise/catch-or-return
        requestId,
        connection: client.connection,
        types: [
            ControlMessage.TYPES.ResendResponseResent,
            ControlMessage.TYPES.ResendResponseNoResend,
        ],
    }).then((v) => {
        if (stream.writable) {
            stream.end()
        }
        return v
    }, (err) => {
        return streamIt.end(err)
    })

    // wait for resend complete message or resend request done
    await Promise.race([
        resend(client, {
            requestId, ...options,
        }),
        onResendDone
    ])

    return streamIt
}

/**
 * Manages creating iterators for a streamr stream.
 * When all iterators are done, calls unsubscribe.
 */

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
        this.return = this.return.bind(this)
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
        const iterator = this.iterate() // start iterator immediately
        await this.sendSubscribe()
        return iterator
    }

    async unsubscribe() {
        pMemoize.clear(this.sendSubscribe)
        await this.sendUnsubscribe()
    }

    async end(optionalErr) {
        await allSettledValues([...this.streams].map(async (it) => {
            await it.end(optionalErr)
        }), 'end failed')
    }

    async return() {
        await allSettledValues([...this.streams].map(async (it) => {
            await it.return()
        }), 'return failed')
    }

    async _cleanup(it) {
        // if iterator never started, finally block never called, thus need to manually clean it
        const hadStream = this.streams.has(it)
        this.streams.delete(it)
        if (hadStream && !this.streams.size) {
            // unsubscribe if no more streams
            await this.unsubscribe()
        }
    }

    count() {
        return this.streams.size
    }

    iterate() {
        const stream = messageStream(this.client.connection, {
            ...this.options,
            signal: this.abortController.signal,
            type: ControlMessage.TYPES.BroadcastMessage,
        })

        const streamIt = streamIterator(stream, {
            abortController: this.abortController,
            onFinally: async () => {
                await this._cleanup(streamIt)
            }
        })

        this.streams.add(streamIt)

        return streamIt
    }

    [Symbol.asyncIterator]() {
        return this.iterate()
    }
}

function SubKey({ streamId, streamPartition = 0 }) {
    if (streamId == null) { throw new Error(`SubKey: invalid streamId: ${streamId} ${streamPartition}`) }
    return `${streamId}::${streamPartition}`
}

/**
 * Top-level interface for creating/destroying subscriptions.
 */

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

    async subscribe(options) {
        const key = SubKey(validateOptions(options))
        const sub = (
            this.subscriptions.get(key)
            || this.subscriptions.set(key, new Subscription(this.client, options)).get(key)
        )

        return sub.subscribe()
    }

    async resend(opts) {
        return iterateResend(this.client, opts)
    }

    async resendSubscribe(options) {
        // create realtime subscription
        const sub = await this.subscribe(options)
        // create resend
        const resendSub = await this.resend(options)

        // end both on end
        async function end(optionalErr) {
            await allSettledValues([
                sub.end(optionalErr),
                resendSub.end(optionalErr),
            ], 'resend end failed')
        }

        const it = iteratorFinally((async function* ResendSubIterator() {
            // iterate over resend
            yield* resendSub
            // then iterate over realtime subscription
            yield* sub
        }()), () => end())

        // attach additional utility functions
        return Object.assign(it, {
            realtime: sub,
            resend: resendSub,
            abort: () => (
                this.abortController && this.abortController.abort()
            ),
            async end(optionalErr) { // eslint-disable-line require-atomic-updates
                try {
                    await end(optionalErr)
                } finally {
                    await it.return()
                }
            }
        })
    }
}
