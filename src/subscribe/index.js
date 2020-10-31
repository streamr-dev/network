import { PassThrough } from 'stream'
import Emitter from 'events'

import pMemoize from 'p-memoize'
import pLimit from 'p-limit'
import { ControlLayer, MessageLayer, Utils, Errors } from 'streamr-client-protocol'

import { uuid, CacheAsyncFn, pOrderedResolve } from '../utils'
import { endStream, pipeline, CancelableGenerator } from '../utils/iterators'

const { OrderingUtil, StreamMessageValidator } = Utils

const { ValidationError } = Errors

const {
    SubscribeRequest, UnsubscribeRequest, ControlMessage,
    ResendLastRequest, ResendFromRequest, ResendRangeRequest,
} = ControlLayer

const { MessageRef, StreamMessage } = MessageLayer

const EMPTY_MESSAGE = {
    serialize() {}
}

export class SignatureRequiredError extends Errors.ValidationError {
    constructor(streamMessage = EMPTY_MESSAGE) {
        super(`Client requires data to be signed. Message: ${streamMessage.serialize()}`)
        this.streamMessage = streamMessage
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

function SubKey({ streamId, streamPartition = 0 }) {
    if (streamId == null) { throw new Error(`SubKey: invalid streamId: ${streamId} ${streamPartition}`) }
    return `${streamId}::${streamPartition}`
}

export function validateOptions(optionsOrStreamId) {
    if (!optionsOrStreamId) {
        throw new Error('options is required!')
    }

    // Backwards compatibility for giving a streamId as first argument
    let options = {}
    if (typeof optionsOrStreamId === 'string') {
        options = {
            streamId: optionsOrStreamId,
            streamPartition: 0,
        }
    } else if (typeof optionsOrStreamId === 'object') {
        if (optionsOrStreamId.stream) {
            const { stream, ...other } = optionsOrStreamId
            return validateOptions({
                ...other,
                ...validateOptions(stream),
            })
        }

        if (optionsOrStreamId.id != null && optionsOrStreamId.streamId == null) {
            options.streamId = optionsOrStreamId.id
        }

        if (optionsOrStreamId.partition == null && optionsOrStreamId.streamPartition == null) {
            options.streamPartition = optionsOrStreamId.partition
        }

        // shallow copy
        options = {
            streamPartition: 0,
            ...options,
            ...optionsOrStreamId
        }
    } else {
        throw new Error(`options must be an object! Given: ${optionsOrStreamId}`)
    }

    if (options.streamId == null) {
        throw new Error(`streamId must be set, given: ${optionsOrStreamId}`)
    }

    options.key = SubKey(options)

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
    await connection.nextConnection()
    return new Promise((resolve, reject) => {
        let cleanup
        let onDisconnected
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
            connection.off('disconnected', onDisconnected)
            types.forEach((type) => {
                connection.off(type, onResponse)
            })
            connection.off(ControlMessage.TYPES.ErrorResponse, onErrorResponse)
        }

        types.forEach((type) => {
            connection.on(type, onResponse)
        })
        connection.on(ControlMessage.TYPES.ErrorResponse, onErrorResponse)

        onDisconnected = () => {
            cleanup()
            reject(new Error('disconnected before got response'))
        }

        connection.once('disconnected', onDisconnected)
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
    const { validate = Validator(client, options) } = options

    const stream = messageStream(client.connection, options)
    const orderingUtil = OrderMessages(client, options)

    const p = pipeline([
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
        console.log('FINALLY endStream >>', err)
        try {
            await endStream(stream, err)
            console.log('FINALLY endStream <<')
        } finally {
            console.log('FINALLY onFinally >>')
            await onFinally(err)
            console.log('FINALLY onFinally <<')
        }
    })

    return Object.assign(p, {
        stream,
        done: () => {
            console.log('done?', stream.writable)
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
    return onResponse.catch((err) => {
        if (err.message.startsWith('Not subscribed to stream')) {
            // noop if unsubscribe failed because we are already unsubscribed
            return
        }
        throw err
    })
}

//
// Resends
//

function createResendRequest(resendOptions) {
    const {
        requestId = uuid('rs'),
        streamId,
        streamPartition = 0,
        sessionToken,
        ...options
    } = resendOptions

    const {
        from,
        to,
        last,
        publisherId,
        msgChainId,
    } = {
        ...options,
        ...options.resend
    }

    const commonOpts = {
        streamId,
        streamPartition,
        requestId,
        sessionToken,
    }

    let request

    if (last > 0) {
        request = new ResendLastRequest({
            ...commonOpts,
            numberLast: last,
        })
    } else if (from && !to) {
        request = new ResendFromRequest({
            ...commonOpts,
            fromMsgRef: new MessageRef(from.timestamp, from.sequenceNumber),
            publisherId,
            msgChainId,
        })
    } else if (from && to) {
        request = new ResendRangeRequest({
            ...commonOpts,
            fromMsgRef: new MessageRef(from.timestamp, from.sequenceNumber),
            toMsgRef: new MessageRef(to.timestamp, to.sequenceNumber),
            publisherId,
            msgChainId,
        })
    }

    if (!request) {
        throw new Error(`Can't _requestResend without resend options. Got: ${JSON.stringify(resendOptions)}`)
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

    const msgs = MessagePipeline(client, {
        ...options,
        type: ControlMessage.TYPES.UnicastMessage,
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
        console.log('done')
        msgs.done()
        return v
    }, (err) => {
        return msgs.cancel(err)
    })

    // wait for resend complete message or resend request done
    await Promise.race([
        resend(client, {
            requestId,
            ...options,
        }),
        onResendDone
    ])

    return msgs
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
        const unsub = this.unsubscribe.bind(this)
        this._subscribe = () => this.queue(sub)
        this.unsubscribe = () => this.queue(unsub)
        this.return = this.return.bind(this)
        this.sendSubscribe = pMemoize(this.sendSubscribe.bind(this))
        this.sendUnsubscribe = pMemoize(this.sendUnsubscribe.bind(this))
        this.validate = Validator(client, options)
        this._onConnected = this._onConnected.bind(this)
        this._onDisconnected = this._onDisconnected.bind(this)
        this._onDisconnecting = this._onDisconnecting.bind(this)
        this._onConnectionDone = this._onConnectionDone.bind(this)
        this._didSubscribe = false
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
        await subscribe(this.client, this.options)
    }

    async sendUnsubscribe() {
        const { connection } = this.client
        // disconnection auto-unsubs, so if already disconnected/disconnecting no need to send unsub
        if (connection.isConnectionValid() && !connection.isDisconnected() && !connection.isDisconnecting()) {
            await unsubscribe(this.client, this.options)
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

    async subscribe() {
        const iterator = this.iterate() // start iterator immediately
        await this._subscribe()
        return iterator
    }

    async return() {
        await allSettledValues([...this.streams].map(async (it) => {
            await it.return()
        }), 'return failed')
    }

    async unsubscribe(...args) {
        return this.cancel(...args)
    }

    async cancel(optionalErr) {
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

    iterate() {
        const msgs = MessagePipeline(this.client, {
            validate: this.validate,
            type: ControlMessage.TYPES.BroadcastMessage,
            ...this.options,
        }, async () => (
            this._cleanupIterator(msgs)
        ))

        this.streams.add(msgs)

        return Object.assign(msgs, {
            count: this.count.bind(this),
            unsubscribe: this.unsubscribe.bind(this),
            subscribe: this.subscribe.bind(this),
        })
    }

    [Symbol.asyncIterator]() {
        return this.iterate()
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

        await sub.cancel() // close all streams (thus unsubscribe)
        return sub
    }

    async subscribe(options) {
        const { key } = validateOptions(options)
        let sub = this.subscriptions.get(key)
        if (!sub) {
            sub = new Subscription(this.client, options, () => {
                this.subscriptions.delete(key, sub)
            })
            this.subscriptions.set(key, sub)
        }

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
            yield* it.resend
            // then iterate over realtime subscription
            yield* it.realtime
        }()), async (err) => {
            await end(err)
        })

        // attach additional utility functions
        return Object.assign(it, {
            options,
            realtime: sub,
            resend: resendSub,
        })
    }
}
