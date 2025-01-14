import { MaybeAsync } from '../types'

export interface ICancelable {
    cancel(err?: Error): Promise<void>
    isCancelled: () => boolean
}

export type Cancelable<T extends object> = T & ICancelable

export type MaybeCancelable<T extends object> = T | Cancelable<T>

/**
 * Allows injecting a function to execute after an iterator finishes.
 * Executes finally function even if generator not started.
 * Returns new generator.
 */
type OnFinallyFn = MaybeAsync<(err?: Error) => void>

export function iteratorFinally<T>(
    iterable: MaybeCancelable<AsyncIterable<T> | AsyncGenerator<T>>,
    onFinally?: OnFinallyFn
): AsyncGenerator<T, any, unknown> {
    if (!onFinally) {
        // noop if no onFinally
        return (async function* Noop() {
            yield* iterable
        })()
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
    function handleFinally<ArgsType extends any[], ReturnType>(
        originalFn: (...args: ArgsType) => PromiseLike<ReturnType>
    ) {
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
    })()

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
                // eslint-disable-next-line require-yield
                return (async function* generatorRunFinally() {
                    try {
                        // NOTE: native generators do not throw if gen.throw(err) called before started
                        // so we should do the same here
                        if ('return' in iterable) {
                            await iterable.return(undefined) // runs onFinally for nested iterable
                        }
                    } finally {
                        await onFinallyOnce()
                    }
                })()
            }

            return it()
        }
    }) as typeof iterable extends Cancelable<typeof iterable> ? Cancelable<AsyncGenerator<T>> : AsyncGenerator<T>
}

export const nextValue = async <T>(source: AsyncIterator<T>): Promise<T | undefined> => {
    const item = source.next()
    return (await item).value
}
