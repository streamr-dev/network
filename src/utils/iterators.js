import { finished, Readable, pipeline as streamPipeline } from 'stream'
import { promisify } from 'util'

import pMemoize from 'p-memoize'

import { Defer, pTimeout } from '../utils'

const pFinished = promisify(finished)

export async function endStream(stream, optionalErr) {
    // ends stream + waits for end
    stream.destroy(optionalErr)
    await true
    try {
        await pFinished(stream)
    } catch (err) {
        if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
            await pFinished(stream, optionalErr)
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
    if (iterable.cancel) {
        g.cancel = (...args) => iterable.cancel(...args)
    }

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

export function CancelableGenerator(iterable, onFinally, { timeout = 250 } = {}) {
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

            // wait for generator if it didn't start or there's a timeout
            // i.e. wait for finally
            if (!started || timeout) {
                await pTimeout(onGenEnd, timeout).catch(pTimeout.ignoreError)
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
                if (!pendingNextCount || timeout) {
                    await pTimeout(iterator.return(), timeout).catch(pTimeout.ignoreError)
                } else {
                    iterator.return()
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

const isPipeline = Symbol('isPipeline')

const getIsStream = (item) => typeof item.pipe === 'function'

export function pipeline(iterables = [], onFinally, opts) {
    const cancelFns = new Set()
    let cancelled = false
    let error
    const onCancelDone = Defer()
    let pipelineValue

    const cancelAll = async (err) => {
        cancelled = true
        error = err
        try {
            // eslint-disable-next-line promise/no-promise-in-callback
            await allSettledValues([...cancelFns].map(async (cancel) => (
                cancel(err)
            )))
        } finally {
            cancelFns.clear()
        }
    }

    const cancel = async (err) => {
        if (cancelled) {
            await onCancelDone
            return
        }
        await cancelAll(err)
        if (error) {
            // eslint-disable-next-line promise/no-promise-in-callback
            pipelineValue.throw(error).catch(() => {}) // ignore err
        } else {
            pipelineValue.return()
        }
        await onCancelDone
    }

    let firstSrc
    const setFirstSource = (v) => {
        firstSrc = v
    }

    const last = iterables.reduce((_prev, next, index) => {
        let stream

        const [cancelCurrent, it] = CancelableGenerator((async function* Gen() {
            // take first "prev" from outer iterator, if one exists
            const prev = index === 0 ? firstSrc : _prev
            let nextIterable = typeof next === 'function' ? next(prev) : next

            if (nextIterable[isPipeline]) {
                nextIterable.setFirstSource(prev)
            }

            if (nextIterable.cancel) {
                cancelFns.add(nextIterable.cancel)
            }

            if (nextIterable && getIsStream(nextIterable)) {
                stream = nextIterable
            }

            if (prev && getIsStream(nextIterable)) {
                const input = getIsStream(prev) ? prev : Readable.from(prev)
                nextIterable = streamPipeline(input, nextIterable, () => {
                    // ignore error
                })
            }
            try {
                yield* nextIterable
            } catch (err) {
                if (!error && err && error !== err) {
                    error = err
                }
                throw err
            }
        }()), async (err) => {
            if (!cancelled && err) {
                await cancelAll(err || error)
            }

            if (stream) {
                await endStream(stream, err || error)
            }
        }, opts)

        cancelFns.add(cancelCurrent)
        return it
    }, undefined)

    pipelineValue = iteratorFinally(last, async () => {
        if (!cancelled) {
            await cancelAll(error)
        }
        cancelFns.clear()
        try {
            await onFinally(error)
            if (error) {
                throw error
            }
        } finally {
            onCancelDone.resolve()
        }
    })

    return Object.assign(pipelineValue, {
        [isPipeline]: true,
        setFirstSource,
        cancel,
    })
}
