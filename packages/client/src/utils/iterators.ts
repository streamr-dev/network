import Emitter from 'events'
import pMemoize from 'p-memoize'
import { MaybeAsync } from '../types'

import { Defer, pTimeout, allSettledValues, AggregatedError, instanceId } from './index'
import { Debug } from './log'
import PushQueue from './PushQueue'

const debug = Debug('iterators')

export type ICancelable = {
    cancel(err?: Error): Promise<void>
    isCancelled: () => boolean
}

export type Cancelable<T> = T & ICancelable

export type MaybeCancelable<T> = T | Cancelable<T>

/**
 * Allows injecting a function to execute after an iterator finishes.
 * Executes finally function even if generator not started.
 * Returns new generator.
 */
type OnFinallyFn = MaybeAsync<(err?: Error) => void>

export function iteratorFinally<T>( // eslint-disable-line no-redeclare
    iterable: MaybeCancelable<AsyncIterable<T> | AsyncGenerator<T>>,
    onFinally?: OnFinallyFn
) {
    if (!onFinally) {
        // noop if no onFinally
        return (async function* Noop() {
            yield* iterable
        }())
    }

    let started = false
    let ended = false
    let error: Error | undefined
    let onFinallyTask: Promise<void> | undefined
    // ensure finally only runs once
    let onFinallyOnce: OnFinallyFn = (err?: Error) => {
        if (!onFinallyTask) {
            // eslint-disable-next-line promise/no-promise-in-callback
            onFinallyTask = Promise.resolve(onFinally(err)).finally(() => {
                onFinallyOnce = () => {}
            })
        }
        return onFinallyTask
    }

    // wraps return/throw to call onFinally even if generator was never started
    function handleFinally<ArgsType extends any[], ReturnType>(originalFn: (...args: ArgsType) => PromiseLike<ReturnType>) {
        return async (...args: ArgsType) => {
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
    }

    // wrap in generator to track if generator was started
    const gen = (async function* TrackStarted() {
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

    const it = gen[Symbol.asyncIterator].bind(gen)
    let g: MaybeCancelable<AsyncGenerator>
    // copy cancel api across if exists
    if ('cancel' in iterable) {
        g = Object.assign(gen, {
            cancel: (err?: Error) => iterable.cancel(err),
            isCancelled: () => iterable.isCancelled()
        })
    } else {
        g = gen
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
                        if ('return' in iterable) {
                            await iterable.return(undefined) // runs onFinally for nested iterable
                        }
                    } finally {
                        await onFinallyOnce()
                    }
                }())
            }

            return it()
        }
    }) as (
        typeof iterable extends Cancelable<typeof iterable>
            ? Cancelable<AsyncGenerator<T>>
            : AsyncGenerator<T>
    )
}

async function endGenerator(gtr: AsyncGenerator, error?: Error) {
    return error
        ? gtr.throw(error).catch(() => {}) // ignore err
        : gtr.return(undefined)
}

function canCancel<T>(gtr: MaybeCancelable<T>): gtr is Cancelable<T> {
    return (
        gtr
        && 'cancel' in gtr && typeof gtr.cancel === 'function'
        && typeof gtr.isCancelled === 'function'
        && !gtr.isCancelled()
    )
}

async function cancelGenerator<T>(gtr: MaybeCancelable<T>, error?: Error) {
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
export function CancelableGenerator<T>(
    iterable: MaybeCancelable<AsyncIterable<T> | AsyncGenerator<T>>,
    onFinally: OnFinallyFn = () => {},
    { timeout = 250 } = {}
) {
    let cancelled = false
    let finalCalled = false
    let error: Error | AggregatedError | undefined

    const cancelSignal = new Emitter()
    const onDone = Defer()

    let iterator: AsyncIterator<T>

    async function cancelIterable(err?: Error) {
        // cancel inner if has cancel
        await cancelGenerator(iterable, err)
        await cancelGenerator(iterator, err)
    }

    function collectErrors(value?: Error | AggregatedError) {
        if (!value || value === error) { return }

        if (!error) {
            error = value
            return
        }

        error = 'extend' in error
            ? error.extend(value, value.message)
            : new AggregatedError([value, error], value.message)
    }

    function resolveCancel(value?: Error) {
        if (value instanceof Error) {
            collectErrors(value)
        }

        if (error) {
            cancelSignal.emit('cancel', error)
        } else {
            cancelSignal.emit('cancel', value)
        }
    }

    const cancel = (gtr: MaybeCancelable<AsyncGenerator<T>>) => async (value: Error) => {
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

    let pendingNext = 0

    async function* CancelableGeneratorFn() {
        // manually iterate
        iterator = iterable[Symbol.asyncIterator]()

        try {
            yield* {
                // each next() races against cancel signal
                next: async () => {
                    pendingNext += 1
                    cancelSignal.setMaxListeners(pendingNext)
                    // NOTE:
                    // Very easy to create a memleak here.
                    // Using a shared promise with Promise.race
                    // between loop iterations prevents data from being GC'ed.
                    // Create new per-loop promise and resolve using an event emitter.
                    const cancelPromise = Defer<{ value: undefined, done: true }>()
                    const onCancel = (v?: Error) => {
                        if (v instanceof Error) {
                            cancelPromise.reject(v)
                        } else {
                            cancelPromise.resolve({ value: undefined, done: true })
                        }
                    }

                    cancelSignal.once('cancel', onCancel)
                    return Promise.race([
                        iterator.next(),
                        cancelPromise,
                    ]).finally(() => {
                        pendingNext -= 1
                        cancelSignal.setMaxListeners(pendingNext)
                        cancelSignal.off('cancel', onCancel)
                    })
                },
                async throw(err: Error): Promise<{ value: T, done: true }> {
                    cancelSignal.removeAllListeners()
                    await endGeneratorTimeout(iterator, err, timeout)
                    throw err
                },
                async return(v?: T) {
                    cancelSignal.removeAllListeners()
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
            cancelSignal.removeAllListeners()
            // try end iterator
            if (iterator) {
                await endGeneratorTimeout(iterator, error, timeout)
            }
        }
    }
    const c = CancelableGeneratorFn()
    const cancelableGenerator = iteratorFinally(c, async (err) => {
        finalCalled = true
        try {
            // cancel inner if has cancel
            await cancelIterable(err || error)
            await onFinally(err || error)
        } finally {
            onDone.resolve(undefined)
        }

        // error whole generator, for await of will reject.
        if (error) {
            throw error
        }

        return onDone
    }) as AsyncGenerator<T>

    const cancelFn = cancel(cancelableGenerator)

    Object.assign(cancelableGenerator, {
        cancel: cancelFn,
        timeout,
        isCancelled: () => cancelled,
        isDone: () => finalCalled,
    })

    return cancelableGenerator as Cancelable<typeof cancelableGenerator>
}

/**
 * Pipeline of async generators
 */

async function defaultOnFinally(err?: Error): Promise<void> {
    if (err) {
        throw err
    }
}

type PipelineStep<T> = (
    AsyncIterable<T>
    | ((src: AsyncIterable<T>) => AsyncIterable<T>)
)

type PipelineSource<T> = (
    AsyncIterable<T>
    | (() => AsyncIterable<T>)
)

type PipelineSteps<T> = [PipelineSource<T>, ...PipelineStep<T>[]]

export class Pipeline implements ICancelable {
    id
    iterables
    debug
    onFinally
    readonly cancelFns = new Set<MaybeCancelable<any>>()
    cancelled = false
    error: Error | undefined
    finallyCalled = false
    readonly onCancelDone = Defer()
    pipelineValue: AsyncGenerator<any>
    firstSrc?: Cancelable<AsyncGenerator<any>>
    options
    constructor(iterables: PipelineSteps<unknown>, onFinally = defaultOnFinally, options: any = {}) {
        this.id = instanceId(this)
        this.debug = debug.extend(this.id)
        this.iterables = iterables
        this.onFinally = onFinally
        this.options = options
        let lastGenerator!: Cancelable<AsyncGenerator>
        if (!this.iterables.length) {
            throw new Error('empty pipeline')
        }

        this.iterables.forEach((next, index) => {
            const prevGenerator = lastGenerator
            const it = CancelableGenerator((async function* Gen(this: Pipeline) {
                this.debug('iterate', index)
                let prev: AsyncGenerator<any> | undefined
                if (index === 0) {
                    prev = this.firstSrc
                } else {
                    prev = prevGenerator!
                }
                const nextIterable = typeof next === 'function' ? next(prev as any) : next
                // take first "prev" from outer iterator, if one exists

                if (prev && (nextIterable instanceof Pipeline)) {
                    nextIterable.setFirstSource(prev as any)
                }

                if ('cancel' in nextIterable) {
                    this.cancelFns.add(nextIterable)
                }

                if (prev && nextIterable && nextIterable instanceof PushQueue) {
                    // prev.id = prev.id || 'inter-' + nextIterable.id
                    nextIterable.from(prev, { end: this.options.end })
                }
                yield* nextIterable
            }.bind(this)()), async (err) => {
                if (!this.error && err && this.error !== err) {
                    this.error = err
                }
            }, this.options)

            this.cancelFns.add(it)
            lastGenerator = it
        })
        this.debug({ lastGenerator })

        this.pipelineValue = iteratorFinally(lastGenerator, async () => {
            if (!this.cancelled) {
                await this.cancelAll(this.error)
            }
            this.cancelFns.clear()
            this.firstSrc = undefined
            try {
                this.finallyCalled = true
                await onFinally(this.error)
                this.finallyCalled = false
                if (this.error) {
                    throw this.error
                }
            } finally {
                this.onCancelDone.resolve(undefined)
                await this.onCancelDone
            }
        }) as Cancelable<typeof lastGenerator>
        this.debug({ pipelineValue: this.pipelineValue })
    }

    async cancelAll(err?: Error) {
        if (this.cancelled) {
            await this.onCancelDone
            return
        }

        this.cancelled = true
        this.error = err
        try {
            // eslint-disable-next-line promise/no-promise-in-callback
            await allSettledValues([...this.cancelFns].map(async (src) => {
                if ('isCancelled' in src && !src.isCancelled()) {
                    await src.cancel(err)
                }
            }))
        } finally {
            this.cancelFns.clear()
        }
    }

    async cancel(err?: Error) {
        if (this.finallyCalled) {
            return
        }

        if (this.cancelled) {
            await this.onCancelDone
            return
        }

        if (this.error) {
            // eslint-disable-next-line promise/no-promise-in-callback
            this.pipelineValue.throw(this.error).catch(() => {}) // ignore err
        } else {
            this.pipelineValue.return(undefined)
        }
        await this.cancelAll(err)
        await this.onCancelDone
    }

    setFirstSource(v: Cancelable<AsyncGenerator<any>>) {
        this.cancelFns.add(v)
        this.firstSrc = v
    }

    isCancelled() {
        return this.cancelled
    }

    throw(err?: Error) {
        this.debug('throw')
        return this.pipelineValue.throw(err)
    }

    return(v?: unknown) {
        return this.pipelineValue.return(v)
    }

    [Symbol.asyncIterator]() {
        return this.pipelineValue[Symbol.asyncIterator]()
    }

}

export function pipeline(...args: ConstructorParameters<typeof Pipeline>) {
    return new Pipeline(...args)
}
