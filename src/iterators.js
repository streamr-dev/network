import { finished } from 'stream'
import { promisify } from 'util'

import pMemoize from 'p-memoize'

import { Defer } from './utils'

export class AbortError extends Error {
    constructor(msg = '', ...args) {
        super(`The operation was aborted. ${msg}`, ...args)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
const pFinished = promisify(finished)

export async function endStream(stream, optionalErr) {
    // ends stream + waits for end
    stream.destroy(optionalErr)
    await true
    try {
        await pFinished(stream)
    } catch (err) {
        if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
            await pFinished(stream)
        }
    }
}

/**
 * Convert allSettled results into a thrown Aggregate error if necessary.
 */

class AggregatedError extends Error {
    // specifically not using AggregateError name
    constructor(errors = [], errorMessage = '') {
        super(errorMessage)
        this.errors = errors
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

async function allSettledValues(items, errorMessage = '') {
    const result = await Promise.allSettled(items)

    const errs = result.filter(({ status }) => status === 'rejected').map(({ reason }) => reason)
    if (errs.length) {
        throw new AggregatedError(errs, errorMessage)
    }

    return result.map(({ value }) => value)
}

/**
 * Allows injecting a function to execute after an iterator finishes.
 * Executes finally function even if generator not started.
 * Returns new generator.
 */

export function iteratorFinally(iterable, onFinally) {
    if (!onFinally) {
        // noop if no onFinally
        return iterable
    }

    // ensure finally only runs once
    const onFinallyOnce = pMemoize(onFinally, {
        cacheKey: () => true // always same key
    })

    let started = false
    let ended = false
    let error

    // wraps return/throw to call onFinally even if generator was never started
    const handleFinally = (originalFn) => async (...args) => {
        // Important to:
        // * only await onFinally if not started
        // * call original return/throw *immediately* in either case
        // Otherwise:
        // * if started, iterator won't stop until onFinally finishes
        // * if not started, iterator can still be started before onFinally finishes
        // This function handles both cases, but note here as a reminder.
        ended = true
        if (started) {
            return originalFn(...args)
        }

        // otherwise iteration can still start if finally function still pending
        try {
            return await originalFn(...args)
        } catch (err) {
            if (!error) {
                error = err
            }
            throw err
        } finally {
            await onFinallyOnce(error)
        }
    }

    // wrap in generator to track if generator was started
    const g = (async function* TrackStarted() {
        started = true
        try {
            yield* iterable
        } catch (err) {
            if (!error) {
                error = err
            }
            throw err
        } finally {
            await onFinallyOnce(error)
        }
    }())

    const it = g[Symbol.asyncIterator].bind(g)
    // replace generator methods
    return Object.assign(g, {
        return: handleFinally(g.return.bind(g)),
        throw: handleFinally(g.throw.bind(g)),
        [Symbol.asyncIterator]() {
            if (ended && !started) {
                // return a generator that simply runs finally script (once)
                return (async function* generatorRunFinally() { // eslint-disable-line require-yield
                    if (typeof iterable.return === 'function') {
                        await iterable.return() // run onFinally for nested iterable
                    }

                    await onFinallyOnce()
                }())
            }
            return it()
        }
    })
}

/**
 * Creates a generator that can be cancelled and perform optional final cleanup.
 * const [cancal, generator] = CancelableGenerator(iterable, onFinally)
 */

export function CancelableGenerator(iterable, onFinally) {
    let started = false
    let cancelled = false
    let finalCalled = false
    let pendingNextCount = 0
    let error

    const onCancel = Defer()
    const onDone = Defer()

    const cancel = (gtr) => async (value) => {
        if (value instanceof Error) {
            if (value !== error) {
                // collect errors
                error = !error
                    ? value
                    : new AggregatedError([value, ...(error.errors || [])], value.message)
            }
        }

        if (cancelled) {
            // prevent recursion
            return onDone
        }

        cancelled = true

        // need to make sure we don't try return inside final otherwise we end up deadlocked
        if (!finalCalled && !pendingNextCount) {
            // try end generator
            const onGenEnd = error
                ? gtr.throw(error).catch(() => {})
                : gtr.return()

            // wait for generator if it didn't start
            // i.e. wait for finally
            if (!started) {
                await onGenEnd
                return onDone
            }
        }

        if (error) {
            onCancel.reject(error)
        } else {
            onCancel.resolve({
                value,
                done: true,
            })
        }

        return onDone
    }

    let iterator
    async function* CancelableGeneratorFn() {
        started = true

        // manually iterate
        iterator = iterable[Symbol.asyncIterator]()

        // keep track of pending calls to next()
        // so we can cancel early if nothing pending
        async function next(...args) {
            // use symbol instead of true so we can tell if called multiple times
            // see === comparison below
            pendingNextCount += 1
            try {
                return await iterator.next(...args)
            } finally {
                pendingNextCount = Math.max(0, pendingNextCount - 1) // eslint-disable-line require-atomic-updates
            }
        }

        try {
            yield* {
                // here is the meat:
                // each next() races against cancel promise
                next: async (...args) => Promise.race([
                    next(...args),
                    onCancel,
                ]),
                [Symbol.asyncIterator]() {
                    return this
                },
            }
        } finally {
            // try end iterator
            if (iterator) {
                if (pendingNextCount) {
                    iterator.return()
                } else {
                    await iterator.return()
                }
            }
        }
    }

    const cancelableGenerator = iteratorFinally(CancelableGeneratorFn(), async () => {
        finalCalled = true
        try {
            // cancel inner if has cancel
            if (iterable && iterable.cancel) {
                await iterable.cancel()
            } else if (iterator && iterator.cancel) {
                await iterator.cancel()
            }

            if (onFinally) {
                await onFinally()
            }
        } finally {
            onDone.resolve()
        }

        // error whole generator, for await of will reject.
        if (error) {
            throw error
        }

        return onDone
    })

    const cancelFn = cancel(cancelableGenerator)
    cancelableGenerator.cancel = cancelFn
    return [
        cancelFn,
        cancelableGenerator
    ]
}

/**
 * Pipeline of async generators
 */

export function pipeline(...iterables) {
    const cancelFns = new Set()
    async function cancelAll(err) {
        try {
            await allSettledValues([...cancelFns].map(async (cancel) => (
                cancel(err)
            )))
        } finally {
            cancelFns.clear()
        }
    }

    let error
    const last = iterables.reduce((prev, next) => {
        const [cancelCurrent, it] = CancelableGenerator((async function* Gen() {
            try {
                const nextIterable = typeof next === 'function' ? next(prev) : next
                yield* nextIterable
            } catch (err) {
                if (!error) {
                    error = err
                    cancelAll(err)
                }
                throw err
            }
        }()))
        cancelFns.add(cancelCurrent)
        return it
    }, undefined)

    const pipelineValue = iteratorFinally(last, () => {
        cancelFns.clear()
    })

    return Object.assign(pipelineValue, {
        cancel: cancelAll,
    })
}

/**
 * Iterates over a Stream
 * Cleans up stream/stops iterator if either stream or iterator ends.
 * Adds abort + end methods to iterator
 */

export function StreamIterator(stream, { abortController, onFinally = () => {}, } = {}) {
    const onFinallyOnce = pMemoize(onFinally) // called once when stream ends

    const it = iteratorFinally((async function* StreamIteratorFn() {
        yield* stream
    }()), async () => {
        try {
            await endStream(stream)
        } finally {
            await onFinallyOnce()
        }
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
            try {
                await endStream(stream, optionalErr)
            } finally {
                if (optionalErr) {
                    await it.throw(optionalErr)
                } else {
                    await it.return()
                }
            }
        }
    })
}
