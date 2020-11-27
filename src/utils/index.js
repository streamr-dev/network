import { inspect } from 'util'

import { v4 as uuidv4 } from 'uuid'
import uniqueId from 'lodash.uniqueid'
import LRU from 'quick-lru'
import pMemoize from 'p-memoize'
import pLimit from 'p-limit'
import mem from 'mem'

import pkg from '../../package.json'

import AggregatedError from './AggregatedError'
import Scaffold from './Scaffold'

export { AggregatedError, Scaffold }

const UUID = uuidv4()

export function uuid(label = '') {
    return uniqueId(`${UUID}${label ? `.${label}` : ''}`) // incrementing + human readable uuid
}

export const counterId = (() => {
    const counts = {}
    let didWarn = false
    // should not be used for many prefixes
    return (prefix = 'ID') => {
        counts[prefix] = counts[prefix] + 1 || 0

        if (!didWarn) {
            const numTracked = Object.keys(counts).length
            if (numTracked > 256) {
                didWarn = true
                console.warn(`counterId should not be used for a large number of unique prefixes: ${numTracked}`)
            }
        }

        return `${prefix}.${counts[prefix]}`
    }
})()

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
 * Deferred promise allowing external control of resolve/reject.
 * Returns a Promise with resolve/reject functions attached.
 * Also has a wrap(fn) method that wraps a function to settle this promise
 * Also has a wrapErrors(fn) method that wraps a function to settle this promise if error
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

    function wrapError(fn) {
        return async (...args) => Promise.resolve(fn(...args)).catch(reject)
    }

    function handleErrBack(err) {
        if (err) {
            reject(err)
        } else {
            resolve()
        }
    }

    return Object.assign(p, {
        resolve,
        reject,
        wrap,
        wrapError,
        handleErrBack
    })
}

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
    const queueOnEmptyTasks = new Map()
    const f = async (id, fn) => {
        const limitFn = pending.get(id) || pending.set(id, pLimit(limit)).get(id)
        const onQueueEmpty = queueOnEmptyTasks.get(id) || queueOnEmptyTasks.set(id, Defer()).get(id)
        try {
            return await limitFn(fn)
        } finally {
            if (!limitFn.activeCount && !limitFn.pendingCount) {
                if (pending.get(id) === limitFn) {
                    // clean up if no more active entries (if not cleared)
                    pending.delete(id)
                }
                queueOnEmptyTasks.delete(id)
                onQueueEmpty.resolve()
            }
        }
    }

    f.getOnQueueEmpty = async (id) => {
        return queueOnEmptyTasks.get(id) || pending.set(id, Defer()).get(id)
    }

    f.clear = () => {
        // note: does not cancel promises
        pending.forEach((p) => p.clearQueue())
        pending.clear()
        queueOnEmptyTasks.forEach((p) => p.resolve())
    }
    return f
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
    if (typeof timeout !== 'number') {
        throw new Error(`timeout must be a number, got ${inspect(timeout)}`)
    }

    let timedOut = false
    let t
    return Promise.race([
        Promise.resolve(promise).catch((err) => {
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

export function pLimitFn(fn, limit = 1) {
    const queue = pLimit(limit)
    return (...args) => queue(() => fn(...args))
}

/**
 * Only allows one outstanding call.
 * Returns same promise while task is executing.
 */

export function pOne(fn) {
    let inProgress
    return (...args) => {
        if (!inProgress) {
            inProgress = Promise.resolve(fn(...args)).finally(() => {
                inProgress = undefined
            })
        }

        return inProgress
    }
}
