import { inspect } from 'util'
import pLimit from 'p-limit'

import { MaybeAsync } from '../types'

import { AggregatedError } from './AggregatedError'
import { Defer } from './Defer'

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
type LimitFn = ReturnType<typeof pLimit>

export type LimitAsyncFnByKeyReturnType<KeyType> = {
    (id: KeyType, fn: () => Promise<any>): Promise<any> 
    getActiveCount(id: KeyType): number
    getPendingCount(id: KeyType): number
    clear(): void 
}

export function LimitAsyncFnByKey<KeyType>(limit = 1): LimitAsyncFnByKeyReturnType<KeyType> {
    const pending = new Map<KeyType, LimitFn>()
    const f = async (id: KeyType, fn: () => Promise<any>) => {
        const limitFn: LimitFn = (pending.get(id) || pending.set(id, pLimit(limit)).get(id)) as LimitFn
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

    f.getActiveCount = (id: KeyType): number => {
        const limitFn = pending.get(id)
        if (!limitFn) { return 0 }
        return limitFn.activeCount
    }

    f.getPendingCount = (id: KeyType): number => {
        const limitFn = pending.get(id)
        if (!limitFn) { return 0 }
        return limitFn.pendingCount
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
export function pOrderedResolve<ArgsType extends unknown[], ReturnType>(
    fn: (...args: ArgsType) => ReturnType
): ((...args: ArgsType) => Promise<any>) & { clear(): void } {
    const queue = pLimit(1)
    return Object.assign(async (...args: ArgsType) => {
        const d = Defer<ReturnType>()
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
export function pLimitFn<ArgsType extends unknown[], ReturnType>(
    fn: (...args: ArgsType) => ReturnType | Promise<ReturnType>,
    limit = 1
): ((...args: ArgsType) => Promise<ReturnType>) & { clear(): void } {
    const queue = pLimit(limit)
    return Object.assign((...args: ArgsType) => queue(() => fn(...args)), {
        clear() {
            queue.clearQueue()
        }
    })
}

/**
 * Only allows one outstanding call.
 * Returns same promise while task is executing.
 */

export function pOne<ArgsType extends unknown[], ReturnType>(
    fn: (...args: ArgsType) => ReturnType | Promise<ReturnType>,
): ((...args: ArgsType) => Promise<ReturnType>) {
    const once = pOnce(fn)
    return async (...args: ArgsType): Promise<ReturnType> => {
        try {
            return await once(...args)
        } finally {
            once.reset()
        }
    }
}

/**
 * Only allows calling `fn` once.
 * Returns same promise while task is executing.
 */

export function pOnce<ArgsType extends unknown[], ReturnType>(
    fn: (...args: ArgsType) => ReturnType | Promise<ReturnType>
): ((...args: ArgsType) => Promise<ReturnType>) & { reset(): void, isStarted(): boolean } {
    type CallStatus = PromiseSettledResult<ReturnType> | { status: 'init' } | { status: 'pending', promise: Promise<ReturnType> }
    let currentCall: CallStatus = { status: 'init' }

    return Object.assign(async function pOnceWrap(...args: ArgsType): Promise<ReturnType> { // eslint-disable-line prefer-arrow-callback
        // capture currentCall so can assign to it, even after reset
        const thisCall = currentCall
        if (thisCall.status === 'pending') {
            return thisCall.promise
        }

        if (thisCall.status === 'fulfilled') {
            return thisCall.value
        }

        if (thisCall.status === 'rejected') {
            throw thisCall.reason
        }

        // status === 'init'

        currentCall = thisCall

        const promise = (async () => {
            // capture value/error
            try {
                const value = await fn(...args)
                Object.assign(thisCall, {
                    promise: undefined, // release promise
                    status: 'fulfilled',
                    value,
                })
                return value
            } catch (reason) {
                Object.assign(thisCall, {
                    promise: undefined, // release promise
                    status: 'rejected',
                    reason,
                })

                throw reason
            }
        })()
        promise.catch(() => {}) // prevent unhandled
        Object.assign(thisCall, {
            status: 'pending',
            promise,
        })

        return promise
    }, {
        isStarted() {
            return currentCall.status !== 'init'
        },
        reset() {
            currentCall = { status: 'init' }
        }
    })
}

export class TimeoutError extends Error {
    public timeout: number
    
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

export async function pTimeout<T>(promise: Promise<T>, ...args: pTimeoutArgs): Promise<T | undefined> {
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
    const p = Defer<T>()
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
                return undefined
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

export async function allSettledValues(items: Parameters<(typeof Promise)['allSettled']>[0], errorMessage = ''): Promise<unknown[]> {
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

// TODO use streamr-test-utils#waitForCondition instead (when streamr-test-utils is no longer a test-only dependency)
/**
 * Wait until a condition is true
 * @param condition - wait until this callback function returns true
 * @param timeOutMs - stop waiting after that many milliseconds, -1 for disable
 * @param pollingIntervalMs - check condition between so many milliseconds
 * @param failedMsgFn - append the string return value of this getter function to the error message, if given
 * @return the (last) truthy value returned by the condition function
 */
export async function until(
    condition: MaybeAsync<() => boolean>,
    timeOutMs = 10000,
    pollingIntervalMs = 100, 
    failedMsgFn?: () => string
): Promise<boolean> {
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
                await wait(pollingIntervalMs) // eslint-disable-line no-await-in-loop
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

// TODO import this from a library (e.g. streamr-test-utils if that is no longer a test-only dependency)
export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
