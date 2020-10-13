import { PassThrough } from 'stream'

import pMemoize from 'p-memoize'
import pLimit from 'p-limit'
import { ControlLayer, MessageLayer, Utils, Errors } from 'streamr-client-protocol'
import AbortController from 'node-abort-controller'

import SignatureRequiredError from './errors/SignatureRequiredError'
import { uuid, CacheAsyncFn, pOrderedResolve } from './utils'
import { endStream, pipeline, AbortError, CancelableGenerator } from './iterators'

const { OrderingUtil, StreamMessageValidator } = Utils

const { ValidationError } = Errors

const {
    SubscribeRequest, UnsubscribeRequest, ControlMessage,
    ResendLastRequest, ResendFromRequest, ResendRangeRequest,
} = ControlLayer

const { MessageRef, StreamMessage } = MessageLayer

export { AbortError }

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

function messageStream(connection, { streamId, streamPartition, type = ControlMessage.TYPES.BroadcastMessage }) {
    // stream acts as buffer
    const msgStream = new PassThrough({
        objectMode: true,
    })

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
        // clean up other handlers
        msgStream
            .off('close', onClose)
            .off('end', onClose)
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

function OrderMessages(client, options = {}) {
    const { gapFillTimeout, retryResendAfter } = client.options
    const { streamId, streamPartition } = validateOptions(options)

    const outStream = new PassThrough({
        objectMode: true,
    })

    let done = false

    const orderingUtil = new OrderingUtil(streamId, streamPartition, (orderedMessage) => {
        if (!outStream.writable || done) {
            return
        }

        if (orderedMessage.isByeMessage()) {
            outStream.end(orderedMessage)
        } else {
            outStream.write(orderedMessage)
        }
    }, (from, to, publisherId, msgChainId) => async () => {
        // eslint-disable-next-line no-use-before-define
        const resendIt = await getResendStream(client, {
            streamId, streamPartition, from, to, publisherId, msgChainId,
        })
        if (done) {
            return
        }
        for (const { streamMessage } of resendIt) {
            orderingUtil.add(streamMessage)
        }
    }, gapFillTimeout, retryResendAfter)

    const markMessageExplicitly = orderingUtil.markMessageExplicitly.bind(orderingUtil)

    return Object.assign(pipeline([
        // eslint-disable-next-line require-yield
        async function* WriteToOrderingUtil(src) {
            for await (const msg of src) {
                orderingUtil.add(msg)
            }
        },
        outStream,
        async function* WriteToOrderingUtil(src) {
            for await (const msg of src) {
                yield msg
            }
        },
    ], async (err) => {
        done = true
        orderingUtil.clearGaps()
        await endStream(outStream, err)
        orderingUtil.clearGaps()
    }), {
        markMessageExplicitly,
    })
}

function Validator(client, opts) {
    const options = validateOptions(opts)
    const cacheOptions = client.options.cache
    const getStream = CacheAsyncFn(client.getStream.bind(client), cacheOptions)
    const isStreamPublisher = CacheAsyncFn(client.isStreamPublisher.bind(client), cacheOptions)
    const isStreamSubscriber = CacheAsyncFn(client.isStreamSubscriber.bind(client), cacheOptions)

    const validator = new StreamMessageValidator({
        getStream,
        isPublisher: CacheAsyncFn(async (publisherId, _streamId) => (
            isStreamPublisher(_streamId, publisherId)
        ), cacheOptions),
        isSubscriber: CacheAsyncFn(async (ethAddress, _streamId) => (
            isStreamSubscriber(_streamId, ethAddress)
        ), cacheOptions)
    })

    // return validation function that resolves in call order
    return pOrderedResolve(async (msg) => {
        // Check special cases controlled by the verifySignatures policy
        if (client.options.verifySignatures === 'never' && msg.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return msg // no validation required
        }

        if (options.verifySignatures === 'always' && !msg.signature) {
            throw new SignatureRequiredError(msg)
        }

        // In all other cases validate using the validator
        await validator.validate(msg) // will throw with appropriate validation failure
        return msg
    })
}

function MessagePipeline(client, opts = {}, onFinally = () => {}) {
    const options = validateOptions(opts)
    const { signal, validate = Validator(client, options) } = options
    const stream = messageStream(client.connection, options)
    const orderingUtil = OrderMessages(client, options)
    let p
    const onAbort = () => {
        p.cancel(new AbortError())
    }

    signal.addEventListener('abort', onAbort, {
        once: true
    })

    if (signal.aborted) {
        stream.destroy(new AbortError())
    }

    p = pipeline([
        stream,
        async function* Validate(src) {
            for await (const { streamMessage } of src) {
                try {
                    yield await validate(streamMessage)
                } catch (err) {
                    if (err instanceof ValidationError) {
                        orderingUtil.markMessageExplicitly(streamMessage)
                        // eslint-disable-next-line no-continue
                        continue
                    }
                }
            }
        },
        orderingUtil,
    ], async (err) => {
        signal.removeEventListener('abort', onAbort, {
            once: true,
        })
        try {
            await endStream(stream, err)
        } finally {
            await onFinally(err)
        }
    })

    return Object.assign(p, {
        stream,
        done: () => {
            if (stream.writable) {
                stream.end()
            }
        }
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

async function getResendStream(client, opts) {
    const options = validateOptions(opts)
    const abortController = new AbortController()

    const msgs = MessagePipeline(client, {
        ...options,
        type: ControlMessage.TYPES.UnicastMessage,
        signal: abortController.signal,
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
        msgs.done()
        return v
    }, (err) => {
        return msgs.cancel(err)
    })

    // wait for resend complete message or resend request done
    await Promise.race([
        resend(client, {
            requestId, ...options,
        }),
        onResendDone
    ])

    return msgs
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
        this.validate = Validator(client, options)
    }

    hasPending() {
        return !!(this.queue.activeCount || this.queue.pendingCount)
    }

    async abort() {
        await this.abortController.abort()
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

    async _unsubscribe() {
        pMemoize.clear(this.sendSubscribe)
        await this.sendUnsubscribe()
    }

    async cancel(optionalErr) {
        if (this.hasPending()) {
            await this.queue(() => {})
        }
        await allSettledValues([...this.streams].map(async (it) => (
            it.cancel(optionalErr)
        )), 'cancel failed')
    }

    async return() {
        await allSettledValues([...this.streams].map(async (it) => {
            await it.return()
        }), 'return failed')
    }

    async unsubscribe(...args) {
        return this.cancel(...args)
    }

    async _cleanup(it) {
        // if iterator never started, finally block never called, thus need to manually clean it
        const hadStream = this.streams.has(it)
        this.streams.delete(it)
        if (hadStream && !this.streams.size) {
            // unsubscribe if no more streams
            await this._unsubscribe()
        }
    }

    count() {
        return this.streams.size
    }

    iterate() {
        const msgs = MessagePipeline(this.client, {
            signal: this.abortController.signal,
            validate: this.validate,
            type: ControlMessage.TYPES.BroadcastMessage,
            ...this.options,
        }, async () => {
            await this._cleanup(msgs)
        })

        this.streams.add(msgs)

        return msgs
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
        if (!sub) {
            return
        }

        await sub.cancel() // close all streams (thus unsubscribe)
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
        return getResendStream(this.client, opts)
    }

    async resendSubscribe(options) {
        // create realtime subscription
        const sub = await this.subscribe(options)
        // create resend
        const resendSub = await this.resend(options)

        // end both on end
        async function end(optionalErr) {
            await Promise.all([
                sub.cancel(optionalErr),
                resendSub.cancel(optionalErr),
            ])
        }

        const [, it] = CancelableGenerator((async function* ResendSubIterator() {
            // iterate over resend
            yield* resendSub
            // then iterate over realtime subscription
            yield* sub
        }()), async (err) => {
            await end(err)
        })

        // attach additional utility functions
        return Object.assign(it, {
            realtime: sub,
            resend: resendSub,
            abort: () => (
                this.abortController && this.abortController.abort()
            ),
        })
    }
}
