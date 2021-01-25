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

/*
 * Incrementing + human readable uuid
 */

export function uuid(label = '') {
    return uniqueId(`${UUID}${label ? `.${label}` : ''}`)
}

export function randomString(length = 20) {
    // eslint-disable-next-line no-bitwise
    return [...Array(length)].map(() => (~~(Math.random() * 36)).toString(36)).join('')
}

/**
 * Generates counter-based ids.
 * Basically lodash.uniqueid but per-prefix.
 * Not universally unique.
 * Generally useful for tracking instances.
 *
 * Careful not to use too many prefixes since it needs to hold all prefixes in memory
 * e.g. don't pass new uuid as a prefix
 *
 * counterId('test') => test.0
 * counterId('test') => test.1
 */

export const counterId = (() => {
    const MAX_PREFIXES = 256
    let counts = {} // possible we could switch this to WeakMap and pass functions or classes.
    let didWarn = false
    const counterIdFn = (prefix = 'ID') => {
        // pedantic: wrap around if count grows too large
        counts[prefix] = (counts[prefix] + 1 || 0) % Number.MAX_SAFE_INTEGER

        // warn once if too many prefixes
        if (!didWarn) {
            const numTracked = Object.keys(counts).length
            if (numTracked > MAX_PREFIXES) {
                didWarn = true
                console.warn(`counterId should not be used for a large number of unique prefixes: ${numTracked} > ${MAX_PREFIXES}`)
            }
        }

        return `${prefix}.${counts[prefix]}`
    }

    /**
     * Clears counts for prefix or all if no prefix supplied.
     *
     * @param {string?} prefix
     */
    counterIdFn.clear = (...args) => {
        // check length to differentiate between clear(undefined) & clear()
        if (args.length) {
            const [prefix] = args
            delete counts[prefix]
        } else {
            // clear all
            counts = {}
        }
    }
    return counterIdFn
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

function clearMatching(cache, matchFn) {
    for (const key of cache.keys()) {
        if (matchFn(key)) {
            cache.delete(key)
        }
    }
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
    onEviction,
    ...opts
} = {}) {
    const cache = new LRU({
        maxSize,
        maxAge,
        onEviction,
    })

    const cachedFn = pMemoize(asyncFn, {
        maxAge,
        cachePromiseRejection,
        cache,
        ...opts,
    })

    cachedFn.clear = () => pMemoize.clear(cachedFn)
    cachedFn.clearMatching = (...args) => clearMatching(cache, ...args)
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
    onEviction,
    ...opts
} = {}) {
    const cache = new LRU({
        maxSize,
        maxAge,
        onEviction,
    })
    const cachedFn = mem(fn, {
        maxAge,
        cache,
        ...opts
    })
    cachedFn.clear = () => mem.clear(cachedFn)
    cachedFn.clearMatching = (...args) => clearMatching(cache, ...args)
    return cachedFn
}

/* eslint-enable object-curly-newline */

/**
 * Deferred promise allowing external control of resolve/reject.
 * Returns a Promise with resolve/reject functions attached.
 * Also has a wrap(fn) method that wraps a function to settle this promise
 * Also has a wrapError(fn) method that wraps a function to settle this promise if error
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

export function LimitAsyncFnByKey(limit = 1) {
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
        queueOnEmptyTasks.clear()
    }
    return f
}

/**
 * Execute functions in parallel, but ensure they resolve in the order they were executed
 */

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

/**
 * Returns a function that executes with limited concurrency.
 */

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

export class TimeoutError extends Error {
    constructor(msg = '', timeout = 0, ...args) {
        super(`The operation timed out. ${timeout}ms. ${msg}`, ...args)
        this.timeout = timeout
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

/**
 * Takes a promise and a timeout and an optional message for timeout errors.
 * Returns a promise that rejects when timeout expires, or when promise settles, whichever comes first.
 *
 * Invoke with positional arguments for timeout & message:
 * await pTimeout(promise, timeout, message)
 *
 * or using an options object for timeout, message & rejectOnTimeout:
 *
 * await pTimeout(promise, { timeout, message, rejectOnTimeout })
 *
 * message and rejectOnTimeout are optional.
 */

export async function pTimeout(promise, ...args) {
    let opts = {}
    if (args[0] && typeof args[0] === 'object') {
        [opts] = args
    } else {
        [opts.timeout, opts.message] = args
    }

    const { timeout = 0, message = '', rejectOnTimeout = true } = opts

    if (typeof timeout !== 'number') {
        throw new Error(`timeout must be a number, got ${inspect(timeout)}`)
    }

    let timedOut = false
    let t
    return Promise.race([
        Promise.resolve(promise).catch((err) => {
            if (timedOut) {
                // ignore errors after timeout
                return
            }

            throw err
        }),
        new Promise((resolve, reject) => {
            t = setTimeout(() => {
                timedOut = true
                if (rejectOnTimeout) {
                    reject(new TimeoutError(message, timeout))
                } else {
                    resolve()
                }
            }, timeout)
        })
    ]).finally(() => {
        clearTimeout(t)
    })
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

export async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

/**
 * Wait until a condition is true
 * @param {function(): Promise<boolean>|function(): boolean} condition wait until this callback function returns true
 * @param {number} [timeOutMs=10000] stop waiting after that many milliseconds, -1 for disable
 * @param {number} [pollingIntervalMs=100] check condition between so many milliseconds
 */
export async function until(condition, timeOutMs = 10000, pollingIntervalMs = 100) {
    let timeout = false
    if (timeOutMs > 0) {
        setTimeout(() => { timeout = true }, timeOutMs)
    }

    // Promise wrapped condition function works for normal functions just the same as Promises
    while (!await Promise.resolve().then(condition)) { // eslint-disable-line no-await-in-loop
        if (timeout) {
            throw new Error(`Timeout after ${timeOutMs} milliseconds`)
        }
        await sleep(pollingIntervalMs) // eslint-disable-line no-await-in-loop
    }
    return condition()
}
