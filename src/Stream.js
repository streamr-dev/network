import pMemoize from 'p-memoize'
import pLimit from 'p-limit'
import { ControlLayer } from 'streamr-client-protocol'
import AbortController from 'node-abort-controller'

import PushQueue, { AbortError } from './PushQueue'
import { uuid } from './utils'

const { SubscribeRequest, UnsubscribeRequest, ControlMessage } = ControlLayer

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

const PAIRS = new Map([
    [ControlMessage.TYPES.SubscribeRequest, ControlMessage.TYPES.SubscribeResponse],
    [ControlMessage.TYPES.UnsubscribeRequest, ControlMessage.TYPES.UnsubscribeResponse],
])

async function waitForResponse({ connection, type, requestId }) {
    return new Promise((resolve, reject) => {
        let onErrorResponse
        const onResponse = (res) => {
            if (res.requestId !== requestId) { return }
            // clean up err handler
            connection.off(ControlMessage.TYPES.ErrorResponse, onErrorResponse)
            resolve(res)
        }
        onErrorResponse = (res) => {
            if (res.requestId !== requestId) { return }
            // clean up success handler
            connection.off(type, onResponse)
            const error = new Error(res.errorMessage)
            error.code = res.errorCode
            reject(error)
        }
        connection.on(type, onResponse)
        connection.on(ControlMessage.TYPES.ErrorResponse, onErrorResponse)
    })
}

async function waitForRequestResponse(client, request) {
    return waitForResponse({
        connection: client.connection,
        type: PAIRS.get(request.type),
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

function iteratorFinally(iterator, onFinally) {
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

function messageIterator(client, { streamId, streamPartition, signal }) {
    const queue = new PushQueue([], {
        signal,
    })
    const isMatchingStreamMessage = getIsMatchingStreamMessage({
        streamId,
        streamPartition
    })
    const onMessage = (msg) => {
        if (isMatchingStreamMessage(msg)) {
            queue.push(msg)
        }
    }
    client.connection.on(ControlMessage.TYPES.BroadcastMessage, onMessage)
    return iteratorFinally(queue, () => {
        client.connection.off(ControlMessage.TYPES.BroadcastMessage, onMessage)
    })
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
        this.iterators = new Set()

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
        await this.sendSubscribe()
        return this.iterate()
    }

    async unsubscribe() {
        pMemoize.clear(this.sendSubscribe)
        await this.sendUnsubscribe()
    }

    async return() {
        await Promise.all([...this.iterators].map(async (it) => {
            await it.return()
        }))
    }

    async _cleanup(it) {
        // if iterator never started, finally block never called, thus need to manually clean it
        this.iterators.delete(it)
        if (!this.iterators.size) {
            // unsubscribe if no more iterators
            await this.unsubscribe()
        }
    }

    count() {
        return this.iterators.size
    }

    iterate() {
        const it = iteratorFinally(messageIterator(this.client, {
            signal: this.abortController.signal,
            ...this.options,
        }), async () => (
            this._cleanup(it)
        ))
        this.iterators.add(it)
        return it
    }

    [Symbol.asyncIterator]() {
        return this.iterate()
    }
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
        return sub ? sub.count() : -1
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

        await sub.return() // close all iterators (thus unsubscribe)
    }
}
