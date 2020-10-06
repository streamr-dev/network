import { finished } from 'stream'
import { promisify } from 'util'

import pMemoize from 'p-memoize'

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
 * Allows injecting a function to execute after an iterator finishes.
 * Executes finally function even if generator not started.
 */

export function iteratorFinally(iterator, onFinally = () => {}) {
    let started = false
    const onFinallyOnce = pMemoize(onFinally)
    const g = (async function* It() {
        started = true
        try {
            yield* iterator
        } finally {
            await onFinallyOnce()
        }
    }())

    // overrides return/throw to call onFinally even if generator was never started
    const oldReturn = g.return
    const oldThrow = g.throw
    return Object.assign(g, {
        return: async (...args) => {
            if (!started) {
                await onFinallyOnce(iterator)
            }
            return oldReturn.call(g, ...args)
        },
        throw: async (...args) => {
            if (!started) {
                await onFinallyOnce()
            }
            return oldThrow.call(g, ...args)
        },
    })
}

export function CancelableIterator(iterable, onFinally = () => {}) {
    let cancel
    let cancelled = false
    let cancelableIterator
    let error
    let waiting = false

    const onCancel = new Promise((resolve, reject) => {
        cancel = (value) => {
            if (cancelled) { return }

            cancelled = true

            if (value instanceof Error) {
                error = value
                if (!waiting) {
                    cancelableIterator.throw(error)
                    return
                }
                reject(error)
                return
            }

            if (!waiting) {
                cancelableIterator.return()
                return
            }

            try {
                resolve({
                    value,
                    done: true,
                })
            } catch (err) {
                reject(err)
            }
        }
    }).finally(() => {
        cancel = () => onCancel
    })

    let innerIterator
    cancelableIterator = iteratorFinally((async function* Gen() {
        innerIterator = iterable[Symbol.asyncIterator]()
        while (true) {
            waiting = true
            let value
            let done
            try {
                // eslint-disable-next-line no-await-in-loop
                ({ value, done } = await Promise.race([
                    innerIterator.next(),
                    onCancel,
                ]))
            } finally {
                waiting = false
            }
            if (done) {
                return value
            }
            yield value
        }
    }()), async () => {
        if (innerIterator) {
            innerIterator.return()
        }
        try {
            await onFinally()
        } finally {
            await cancel()
        }
    })

    return Object.assign(cancelableIterator, {
        onCancel,
        cancel,
    })
}

export function pipeline(...iterables) {
    let final
    function done(err) {
        final.cancel(err)
    }

    let error

    const last = iterables.reduce((prev, next) => {
        return CancelableIterator((async function* Gen() {
            try {
                const nextIterable = typeof next === 'function' ? next(prev) : next
                yield* nextIterable
            } catch (err) {
                if (!error) {
                    error = err
                    return final.cancel(err)
                }
                throw err
            }
        }()))
    }, undefined)
    final = CancelableIterator((async function* Gen() {
        yield* last
    }()), () => done(error))
    return final
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
