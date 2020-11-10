import { v4 as uuidv4 } from 'uuid'
import uniqueId from 'lodash.uniqueid'
import LRU from 'quick-lru'
import pMemoize from 'p-memoize'
import pLimit from 'p-limit'
import mem from 'mem'

import pkg from '../../package.json'

const UUID = uuidv4()

export function uuid(label = '') {
    return uniqueId(`${UUID}${label ? `.${label}` : ''}`) // incrementing + human readable uuid
}

export function getVersionString() {
    const isProduction = process.env.NODE_ENV === 'production'
    return `${pkg.version}${!isProduction ? 'dev' : ''}`
}

/**
 * Converts a .once event listener into a promise.
 * Rejects if an 'error' event is received before resolving.
 */

export function waitFor(emitter, event) {
    return new Promise((resolve, reject) => {
        let onError
        const onEvent = (value) => {
            emitter.off('error', onError)
            resolve(value)
        }
        onError = (error) => {
            emitter.off(event, onEvent)
            reject(error)
        }

        emitter.once(event, onEvent)
        emitter.once('error', onError)
    })
}

export const getEndpointUrl = (baseUrl, ...pathParts) => {
    return baseUrl + '/' + pathParts.map((part) => encodeURIComponent(part)).join('/')
}

/* eslint-disable object-curly-newline */

/**
 * Returns a cached async fn, cached keyed on first argument passed. See documentation for mem/p-memoize.
 * Caches into a LRU cache capped at options.maxSize
 * Won't call asyncFn again until options.maxAge or options.maxSize exceeded, or cachedAsyncFn.clear() is called.
 * Won't cache rejections by default. Override with options.cachePromiseRejection = true.
 *
 * ```js
 * const cachedAsyncFn = CacheAsyncFn(asyncFn, options)
 * await cachedAsyncFn(key)
 * await cachedAsyncFn(key)
 * cachedAsyncFn.clear()
 * ```
 */

export function CacheAsyncFn(asyncFn, {
    maxSize = 10000,
    maxAge = 30 * 60 * 1000, // 30 minutes
    cachePromiseRejection = false,
} = {}) {
    const cachedFn = pMemoize(asyncFn, {
        maxAge,
        cachePromiseRejection,
        cache: new LRU({
            maxSize,
        })
    })
    cachedFn.clear = () => pMemoize.clear(cachedFn)
    return cachedFn
}

/**
 * Returns a cached fn, cached keyed on first argument passed. See documentation for mem.
 * Caches into a LRU cache capped at options.maxSize
 * Won't call fn again until options.maxAge or options.maxSize exceeded, or cachedFn.clear() is called.
 *
 * ```js
 * const cachedFn = CacheFn(fn, options)
 * cachedFn(key)
 * cachedFn(key)
 * cachedFn(...args)
 * cachedFn.clear()
 * ```
 */

export function CacheFn(fn, {
    maxSize = 10000,
    maxAge = 30 * 60 * 1000, // 30 minutes
} = {}) {
    const cachedFn = mem(fn, {
        maxAge,
        cache: new LRU({
            maxSize,
        })
    })
    cachedFn.clear = () => mem.clear(cachedFn)
    return cachedFn
}

/* eslint-enable object-curly-newline */

/**
 * Returns a limit function that limits concurrency per-key.
 *
 * ```js
 * const limit = LimitAsyncFnByKey(1)
 * limit('channel1', fn)
 * limit('channel2', fn)
 * limit('channel2', fn)
 * ```
 */

export function LimitAsyncFnByKey(limit) {
    const pending = new Map()
    const f = async (id, fn) => {
        const limitFn = pending.get(id) || pending.set(id, pLimit(limit)).get(id)
        try {
            return await limitFn(fn)
        } finally {
            if (!limitFn.activeCount && !limitFn.pendingCount && pending.get(id) === limitFn) {
                // clean up if no more active entries (if not cleared)
                pending.delete(id)
            }
        }
    }
    f.clear = () => {
        // note: does not cancel promises
        pending.forEach((p) => p.clearQueue())
        pending.clear()
    }
    return f
}

/**
 * Deferred promise allowing external control of resolve/reject.
 * Returns a Promise with resolve/reject functions attached.
 * Also has a wrap(fn) method that wraps a function to settle this promise
 * Defer optionally takes executor function ala `new Promise(executor)`
 */

export function Defer(executor = () => {}) {
    let resolve
    let reject
    // eslint-disable-next-line promise/param-names
    const p = new Promise((_resolve, _reject) => {
        resolve = _resolve
        reject = _reject
        executor(resolve, reject)
    })

    function wrap(fn) {
        return async (...args) => Promise.resolve(fn(...args)).then(resolve, reject)
    }

    return Object.assign(p, {
        resolve,
        reject,
        wrap,
    })
}

export function pOrderedResolve(fn) {
    const queue = pLimit(1)
    return async (...args) => {
        const d = Defer()
        const done = queue(() => d)
        // eslint-disable-next-line promise/catch-or-return
        await Promise.resolve(fn(...args)).then(d.resolve, d.reject)
        return done
    }
}

export class TimeoutError extends Error {
    constructor(msg = '', timeout = 0, ...args) {
        super(`The operation timed out. ${timeout}ms. ${msg}`, ...args)
        this.timeout = timeout
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export async function pTimeout(promise, timeout = 0, message = '') {
    let timedOut = false
    let t
    return Promise.race([
        promise.catch((err) => {
            if (timedOut) {
                // ignore errors after timeout
            }

            throw err
        }),
        new Promise((resolve, reject) => {
            t = setTimeout(() => {
                timedOut = true
                reject(new TimeoutError(message, timeout))
            }, timeout)
        })
    ]).finally(() => {
        clearTimeout(t)
    })
}

pTimeout.ignoreError = (err) => {
    if (err instanceof TimeoutError) { return }
    throw err
}

export class AggregatedError extends Error {
    // specifically not using AggregateError name as this has slightly different API
    constructor(errors = [], errorMessage = '') {
        super(errorMessage)
        this.errors = new Set(errors)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }

    extend(err, message = '') {
        if (err === this || this.errors.has(err)) {
            return this
        }

        return new AggregatedError([err, ...this.errors], [message, this.message || ''].join('\n'))
    }
}

/**
 * Convert allSettled results into a thrown Aggregate error if necessary.
 */

export async function allSettledValues(items, errorMessage = '') {
    const result = await Promise.allSettled(items)

    const errs = result.filter(({ status }) => status === 'rejected').map(({ reason }) => reason)
    if (errs.length) {
        throw new AggregatedError(errs, errorMessage)
    }

    return result.map(({ value }) => value)
}

export function pUpDownSteps(sequence = [], checkFn) {
    const onDownSteps = []
    const nextSteps = sequence.slice().reverse()
    const prevSteps = []
    const queue = pLimit(1)
    async function next(...args) {
        if (await checkFn()) {
            if (nextSteps.length) {
                const stepFn = nextSteps.pop()
                const onDownStep = await stepFn()
                prevSteps.push(stepFn)
                onDownSteps.push(onDownStep)
                return next(...args)
            }
        } else if (onDownSteps.length) {
            const stepFn = onDownSteps.pop()
            await stepFn()
            nextSteps.push(prevSteps.pop())
            return next(...args)
        }

        return Promise.resolve()
    }

    return (...args) => queue(() => next(...args))
}
