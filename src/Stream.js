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

async function* messageIterator(client, { streamId, streamPartition, signal }) {
    let onMessage
    try {
        const queue = new PushQueue([], {
            signal,
        })
        const isMatchingStreamMessage = getIsMatchingStreamMessage({
            streamId,
            streamPartition
        })
        onMessage = (msg) => {
            if (isMatchingStreamMessage(msg)) {
                queue.push(msg)
            }
        }
        client.connection.on(ControlMessage.TYPES.BroadcastMessage, onMessage)
        yield* queue
    } finally {
        // clean up
        client.connection.off(ControlMessage.TYPES.BroadcastMessage, onMessage)
    }
}

function SubKey({ streamId, streamPartition = 0 }) {
    if (streamId == null) { throw new Error(`SubKey: invalid streamId: ${streamId} ${streamPartition}`) }
    return `${streamId}|${streamPartition}`
}

function Iterator(iterator, onFinally) {
    return (async function* It() {
        try {
            yield* iterator
        } finally {
            await onFinally(iterator)
        }
    }())
}

class Subscription {
    constructor(client, options) {
        this.client = client
        this.options = validateOptions(options)
        this.key = SubKey(this.options)
        this.abortController = new AbortController()
        this.iterators = new Set()
        this.queue = pLimit(1)
        const sub = this.subscribe.bind(this)
        const unsub = this.unsubscribe.bind(this)
        this.subscribe = () => this.queue(sub)
        this.unsubscribe = () => this.queue(unsub)
        this.return = this.return.bind(this)
        this._subscribe = pMemoize(() => {
            return subscribe(this.client, this.options)
        })
        this._unsubscribe = pMemoize(() => {
            return unsubscribe(this.client, this.options)
        })
    }

    async abort() {
        this.abortController.abort()
        await this.queue(() => {}) // pending tasks done
    }

    async subscribe() {
        this.shouldSubscribe = true
        pMemoize.clear(this._unsubscribe)
        await this._subscribe()
        return this.iterate()
    }

    async unsubscribe() {
        this.shouldSubscribe = false
        pMemoize.clear(this._subscribe)
        await this._unsubscribe()
    }

    async return() {
        this.shouldSubscribe = false
        await Promise.all([...this.iterators].map(async (it) => {
            await it.return()
            await this.cleanup(it)
        }))
    }

    async cleanup(it) {
        // if iterator never started need to manually clean it
        this.iterators.delete(it)
        if (!this.iterators.size) {
            // unsubscribe if no more iterators
            await this.unsubscribe()
        }
    }

    count() {
        return this.iterators.size
    }

    async* createIterator() {
        if (!this.shouldSubscribe) {
            return
        }

        yield* messageIterator(this.client, {
            signal: this.abortController.signal,
            ...this.options,
        })
    }

    iterate() {
        const it = Iterator(this.createIterator(), async () => {
            await this.cleanup(it)
        })
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
        await sub.queue(() => {}) // wait for any outstanding operations
        await sub.return() // close all iterators (thus unsubscribe)
    }
}
