import pMemoize from 'p-memoize'

import { Defer, pTimeout, allSettledValues, AggregatedError } from './index'

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

    let started = false
    let ended = false
    let error
    let onFinallyTask
    // ensure finally only runs once
    const onFinallyOnce = (err) => {
        if (!onFinallyTask) {
            // eslint-disable-next-line promise/no-promise-in-callback
            onFinallyTask = Promise.resolve().then(async () => onFinally(err))
        }
        return onFinallyTask
    }

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

    // copy cancel api across if exists
    if (iterable.cancel) {
        g.cancel = (...args) => iterable.cancel(...args)
        g.isCancelled = (...args) => iterable.isCancelled(...args)
    }

    // replace generator methods
    return Object.assign(g, {
        return: handleFinally(g.return.bind(g)),
        throw: handleFinally(g.throw.bind(g)),
        [Symbol.asyncIterator]() {
            // if ended before started
            if (ended && !started) {
                // return a generator that simply runs finally script (once)
                return (async function* generatorRunFinally() { // eslint-disable-line require-yield
                    try {
                        // NOTE: native generators do not throw if gen.throw(err) called before started
                        // so we should do the same here
                        if (typeof iterable.return === 'function') {
                            await iterable.return() // runs onFinally for nested iterable
                        }
                    } finally {
                        await onFinallyOnce()
                    }
                }())
            }

            return it()
        }
    })
}

async function endGenerator(gtr, error) {
    return error
        ? gtr.throw(error).catch(() => {}) // ignore err
        : gtr.return()
}

function canCancel(gtr) {
    return (
        gtr
        && typeof gtr.cancel === 'function'
        && typeof gtr.isCancelled === 'function'
        && !gtr.isCancelled()
    )
}

async function cancelGenerator(gtr, error) {
    if (!canCancel(gtr)) { return }
    await gtr.cancel(error)
}

const endGeneratorTimeout = pMemoize(async (gtr, error, timeout = 250) => {
    await pTimeout(endGenerator(gtr, error), {
        timeout,
        rejectOnTimeout: false,
    })

    if (canCancel(gtr)) {
        await cancelGenerator(gtr, error)
    }
}, {
    cache: new WeakMap(),
    cachePromiseRejection: true,
})

/**
 * Creates a generator that can be cancelled and perform optional final cleanup.
 * const [cancal, generator] = CancelableGenerator(iterable, onFinally)
 */

export function CancelableGenerator(iterable, onFinally = () => {}, { timeout = 250 } = {}) {
    let started = false
    let cancelled = false
    let finalCalled = false
    let pendingNextCount = 0
    let error

    const onCancel = Defer()
    const onDone = Defer()

    let iterator

    async function cancelIterable(err) {
        // cancel inner if has cancel
        await cancelGenerator(iterable, err)
        await cancelGenerator(iterator, err)
    }

    function collectErrors(value) {
        if (!value || value === error) { return }

        if (!error) {
            error = value
            return
        }

        error = error.extend
            ? error.extend(value, value.message)
            : new AggregatedError([value, error], value.message)
    }

    function resolveCancel(value) {
        if (value instanceof Error) {
            collectErrors(value)
        }

        if (error) {
            onCancel.reject(error)
            if (!started) {
                onCancel.catch(() => {})
            }
        } else {
            onCancel.resolve({
                value,
                done: true,
            })
        }
    }

    const cancel = (gtr) => async (value) => {
        if (cancelled || finalCalled) {
            // prevent recursion
            return onDone
        }

        cancelled = true
        resolveCancel(value)

        // need to make sure we don't try return inside final otherwise we end up deadlocked
        await endGeneratorTimeout(gtr, error, timeout)
        return onDone
    }

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
                async throw(err) {
                    await endGeneratorTimeout(iterator, err, timeout)
                    throw err
                },
                async return(v) {
                    await endGeneratorTimeout(iterator, error, timeout)
                    return {
                        value: v,
                        done: true,
                    }
                },
                [Symbol.asyncIterator]() {
                    return this
                },
            }
        } finally {
            // try end iterator
            if (iterator) {
                await endGeneratorTimeout(iterator, error, timeout)
            }
        }
    }

    const cancelableGenerator = iteratorFinally(CancelableGeneratorFn(), async (err) => {
        finalCalled = true
        try {
            // cancel inner if has cancel
            await cancelIterable(err || error)
            await onFinally(err || error)
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

    Object.assign(cancelableGenerator, {
        cancel: cancelFn,
        timeout,
        isCancelled: () => cancelled,
        isDone: () => finalCalled,
    })

    return cancelableGenerator
}

/**
 * Pipeline of async generators
 */

const isPipeline = Symbol('isPipeline')

const getIsStream = (item) => typeof item.from === 'function'

async function defaultOnFinally(err) {
    if (err) {
        throw err
    }
}

export function pipeline(iterables = [], onFinally = defaultOnFinally, { end, ...opts } = {}) {
    const cancelFns = new Set()
    let cancelled = false
    let error
    let finallyCalled = false
    const onCancelDone = Defer()
    let pipelineValue

    const cancelAll = async (err) => {
        if (cancelled) {
            await onCancelDone
            return
        }

        cancelled = true
        error = err
        try {
            // eslint-disable-next-line promise/no-promise-in-callback
            await allSettledValues([...cancelFns].map(async ({ isCancelled, cancel }) => (
                !isCancelled() ? cancel(err) : undefined
            )))
        } finally {
            cancelFns.clear()
        }
    }

    const cancel = async (err) => {
        if (finallyCalled) {
            return
        }

        if (cancelled) {
            await onCancelDone
            return
        }

        if (error) {
            // eslint-disable-next-line promise/no-promise-in-callback
            pipelineValue.throw(error).catch(() => {}) // ignore err
        } else {
            pipelineValue.return()
        }
        await cancelAll(err)
        await onCancelDone
    }

    let firstSrc
    const setFirstSource = (v) => {
        cancelFns.add(v)
        firstSrc = v
    }

    const last = iterables.reduce((_prev, next, index) => {
        const it = CancelableGenerator((async function* Gen() {
            const prev = index === 0 ? firstSrc : _prev
            // take first "prev" from outer iterator, if one exists
            const nextIterable = typeof next === 'function' ? next(prev) : next

            if (prev && nextIterable[isPipeline]) {
                nextIterable.setFirstSource(prev)
            }

            if (nextIterable.cancel) {
                cancelFns.add(nextIterable)
            }

            if (prev && nextIterable && getIsStream(nextIterable)) {
                prev.id = prev.id || 'inter-' + nextIterable.id
                nextIterable.from(prev, { end })
            }
            yield* nextIterable
        }()), async (err) => {
            if (!error && err && error !== err) {
                error = err
            }
        }, opts)

        cancelFns.add(it)
        return it
    }, undefined)

    pipelineValue = iteratorFinally(last, async () => {
        if (!cancelled) {
            await cancelAll(error)
        }
        cancelFns.clear()
        try {
            finallyCalled = true
            await onFinally(error)
            finallyCalled = false
            if (error) {
                throw error
            }
        } finally {
            onCancelDone.resolve()
            await onCancelDone
        }
    })

    return Object.assign(pipelineValue, {
        [isPipeline]: true,
        isCancelled: () => cancelled,
        setFirstSource,
        cancel,
    })
}
