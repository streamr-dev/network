import { inspect } from 'util'
import EventEmitter from 'events'
import { v4 as uuidv4 } from 'uuid'
import uniqueId from 'lodash/uniqueId'
import pMemoize from 'p-memoize'
import pLimit from 'p-limit'
import mem from 'mem'
import { L, F } from 'ts-toolbelt'

import pkg from '../../package.json'
import LRU from '../../vendor/quick-lru'
import { MaybeAsync } from '../types'

import AggregatedError from './AggregatedError'
import Scaffold from './Scaffold'

export { AggregatedError, Scaffold }

const UUID = uuidv4()

export const SEPARATOR = ':'
/*
 * Incrementing + human readable uuid
 */

export function uuid(label = '') {
    return uniqueId(`${UUID}${label ? `${SEPARATOR}${label}` : ''}`)
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
    let counts: { [prefix: string]: number } = {} // possible we could switch this to WeakMap and pass functions or classes.
    let didWarn = false
    const counterIdFn = (prefix = 'ID', separator = SEPARATOR) => {
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

        return `${prefix}${separator}${counts[prefix]}`
    }

    /**
     * Clears counts for prefix or all if no prefix supplied.
     *
     * @param {string?} prefix
     */
    counterIdFn.clear = (...args: [string] | []) => {
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

export function waitFor(emitter: EventEmitter, event: Parameters<EventEmitter['on']>[0]) {
    return new Promise((resolve, reject) => {
        let onError: (error: Error) => void
        const onEvent = (value: any) => {
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

export const getEndpointUrl = (baseUrl: string, ...pathParts: string[]) => {
    return baseUrl + '/' + pathParts.map((part) => encodeURIComponent(part)).join('/')
}

type Collection<K, V> = {
    keys: Map<K, V>['keys']
    delete: Map<K, V>['delete']
}

function clearMatching(cache: Collection<unknown, unknown>, matchFn: (key: unknown) => boolean) {
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

export function CacheAsyncFn(asyncFn: Parameters<typeof pMemoize>[0], {
    maxSize = 10000,
    maxAge = 30 * 60 * 1000, // 30 minutes
    cachePromiseRejection = false,
    onEviction = () => {},
    ...opts
} = {}) {
    const cache = new LRU<unknown, { data: unknown, maxAge: number }>({
        maxSize,
        maxAge,
        onEviction,
    })

    const cachedFn = Object.assign(pMemoize(asyncFn, {
        maxAge,
        cachePromiseRejection,
        cache,
        ...opts,
    }), {
        clear: () => pMemoize.clear(cachedFn),
        clearMatching: (...args: L.Tail<Parameters<typeof clearMatching>>) => clearMatching(cache, ...args),
    })

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

export function CacheFn(fn: Parameters<typeof mem>[0], {
    maxSize = 10000,
    maxAge = 30 * 60 * 1000, // 30 minutes
    onEviction = () => {},
    ...opts
} = {}) {
    const cache = new LRU<unknown, { data: unknown, maxAge: number }>({
        maxSize,
        maxAge,
        onEviction,
    })

    const cachedFn = Object.assign(mem(fn, {
        maxAge,
        cache,
        ...opts,
    }), {
        clear: () => mem.clear(cachedFn),
        clearMatching: (...args: L.Tail<Parameters<typeof clearMatching>>) => clearMatching(cache, ...args),
    })

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
type PromiseResolve = L.Compulsory<Parameters<Promise<any>['then']>>[0]
type PromiseReject = L.Compulsory<Parameters<Promise<any>['then']>>[1]

const noop = () => {}

export function Defer<T>(executor: (...args: Parameters<Promise<T>['then']>) => void = noop) {
    let resolveFn: PromiseResolve | undefined
    let rejectFn: PromiseResolve | undefined
    const resolve: PromiseReject = (value) => {
        if (resolveFn) {
            const r = resolveFn
            resolveFn = undefined
            rejectFn = undefined
            r(value)
        }
    }
    const reject: PromiseReject = (error) => {
        if (rejectFn) {
            const r = rejectFn
            resolveFn = undefined
            rejectFn = undefined
            r(error)
        }
    }

    // eslint-disable-next-line promise/param-names
    const p: Promise<T> = new Promise((_resolve, _reject) => {
        resolveFn = _resolve
        rejectFn = _reject
        executor(resolve, reject)
    })
    p.catch(() => {}) // prevent unhandledrejection

    function wrap(fn: F.Function) {
        return async (...args: unknown[]) => {
            try {
                return resolve(await fn(...args))
            } catch (err) {
                reject(err)
            }
            return Promise.resolve()
        }
    }

    function wrapError(fn: F.Function) {
        return async (...args: unknown[]) => {
            try {
                return await fn(...args)
            } catch (err) {
                reject(err)
            }
            return Promise.resolve()
        }
    }

    function handleErrBack(err?: Error) {
        if (err) {
            reject(err)
        } else {
            resolve(undefined)
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

export function LimitAsyncFnByKey<KeyType>(limit = 1) {
    const pending = new Map()
    const f = async (id: KeyType, fn: () => Promise<any>) => {
        const limitFn = pending.get(id) || pending.set(id, pLimit(limit)).get(id)
        try {
            return await limitFn(fn)
        } finally {
            if (!limitFn.activeCount && !limitFn.pendingCount) {
                if (pending.get(id) === limitFn) {
                    // clean up if no more active entries (if not cleared)
                    pending.delete(id)
                }
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
 * Execute functions in parallel, but ensure they resolve in the order they were executed
 */

export function pOrderedResolve(fn: F.Function) {
    const queue = pLimit(1)
    return Object.assign(async (...args: Parameters<typeof fn>) => {
        const d = Defer()
        const done = queue(() => d)
        // eslint-disable-next-line promise/catch-or-return
        await Promise.resolve(fn(...args)).then(d.resolve, d.reject)
        return done
    }, {
        clear() {
            queue.clearQueue()
        }
    })
}

/**
 * Returns a function that executes with limited concurrency.
 */

export function pLimitFn(fn: F.Function, limit = 1) {
    const queue = pLimit(limit)
    return Object.assign((...args: unknown[]) => queue(() => fn(...args)), {
        clear() {
            queue.clearQueue()
        }
    })
}

/**
 * Unwrap a Promise type e.g. Awaited<Promise<T>> => T
 * Required as TS doesn't (currently) understand Promise<T> is equivalent to Promise<Promise<T>>
 */
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T

/**
 * Only allows one outstanding call.
 * Returns same promise while task is executing.
 */

export function pOne<Args extends any[], R>(
    fn: (...args: Args) => R
): (...args: Args) => Promise<Awaited<R>> {
    let inProgress: Promise<Awaited<R>> | undefined
    return async (...args: Args): Promise<Awaited<R>> => {
        if (inProgress) {
            return inProgress
        }

        inProgress = (async () => {
            try {
                return await Promise.resolve(fn(...args)) as Awaited<R>
            } finally {
                inProgress = undefined
            }
        })()

        return inProgress
    }
}

/**
 * Only allows calling `fn` once.
 * Returns same promise while task is executing.
 */

export function pOnce<Args extends any[], R>(
    fn: (...args: Args) => R
): (...args: Args) => Promise<Awaited<R>> {
    let inProgress: Promise<void> | undefined
    let started = false
    let value: Awaited<R>
    let error: Error | undefined
    return async (...args: Args) => {
        if (!started) {
            started = true
            inProgress = (async () => {
                try {
                    value = await Promise.resolve(fn(...args)) as Awaited<R>
                } catch (err) {
                    error = err
                } finally {
                    inProgress = undefined
                }
            })()
        }

        if (inProgress) {
            await inProgress
        }

        if (error) {
            throw error
        }

        return value
    }
}

export class TimeoutError extends Error {
    timeout: number
    constructor(msg = '', timeout = 0) {
        super(`The operation timed out. ${timeout}ms. ${msg}`)
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

type pTimeoutOpts = {
    timeout?: number,
    message?: string,
    rejectOnTimeout?: boolean,
}

type pTimeoutArgs = [timeout?: number, message?: string] | [pTimeoutOpts]

export async function pTimeout(promise: Promise<unknown>, ...args: pTimeoutArgs) {
    let opts: pTimeoutOpts = {}
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
    const p = Defer()
    const t = setTimeout(() => {
        timedOut = true
        if (rejectOnTimeout) {
            p.reject(new TimeoutError(message, timeout))
        } else {
            p.resolve(undefined)
        }
    }, timeout)
    p.catch(() => {})

    return Promise.race([
        Promise.resolve(promise).catch((err) => {
            clearTimeout(t)
            if (timedOut) {
                // ignore errors after timeout
                return
            }

            throw err
        }),
        p
    ]).finally(() => {
        clearTimeout(t)
        p.resolve(undefined)
    })
}

/**
 * Convert allSettled results into a thrown Aggregate error if necessary.
 */

export async function allSettledValues(items: Parameters<typeof Promise['allSettled']>, errorMessage = '') {
    const result = await Promise.allSettled(items)
    const errs = result
        .filter(({ status }) => status === 'rejected')
        .map((v) => (v as PromiseRejectedResult).reason)
    if (errs.length) {
        throw new AggregatedError(errs, errorMessage)
    }

    return result
        .map((v) => (v as PromiseFulfilledResult<unknown>).value)
}

export async function sleep(ms: number = 0) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

/**
 * Wait until a condition is true
 * @param condition - wait until this callback function returns true
 * @param timeOutMs - stop waiting after that many milliseconds, -1 for disable
 * @param pollingIntervalMs - check condition between so many milliseconds
 * @param failedMsgFn - append the string return value of this getter function to the error message, if given
 * @return the (last) truthy value returned by the condition function
 */
export async function until(condition: MaybeAsync<() => boolean>, timeOutMs = 10000, pollingIntervalMs = 100, failedMsgFn?: () => string) {
    // condition could as well return any instead of boolean, could be convenient
    // sometimes if waiting until a value is returned. Maybe change if such use
    // case emerges.
    const err = new Error(`Timeout after ${timeOutMs} milliseconds`)
    let isTimedOut = false
    let t!: ReturnType<typeof setTimeout>
    if (timeOutMs > 0) {
        t = setTimeout(() => { isTimedOut = true }, timeOutMs)
    }

    try {
        // Promise wrapped condition function works for normal functions just the same as Promises
        let wasDone = false
        while (!wasDone && !isTimedOut) { // eslint-disable-line no-await-in-loop
            wasDone = await Promise.resolve().then(condition) // eslint-disable-line no-await-in-loop
            if (!wasDone && !isTimedOut) {
                await sleep(pollingIntervalMs) // eslint-disable-line no-await-in-loop
            }
        }

        if (isTimedOut) {
            if (failedMsgFn) {
                err.message += ` ${failedMsgFn()}`
            }
            throw err
        }

        return wasDone
    } finally {
        clearTimeout(t)
    }
}
