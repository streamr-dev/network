import { PassThrough, finished } from 'stream'
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
const isIteratorFinally = Symbol('iteratorFinally')
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
    g[isIteratorFinally] = true

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

const isCancelableIterator = Symbol('CancelableIterator')
export function CancelableIterator(iterable) {
    let cancel
    const onCancel = new Promise((resolve, reject) => {
        cancel = (value) => {
            if (value instanceof Error) {
                reject(value)
                return
            }
            resolve(value)
        }
    })

    const cancelableIterator = iteratorFinally((async function* Gen() {
        const it = iterable[Symbol.asyncIterator]()
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const { value, done } = await Promise.race([
                it.next(),
                onCancel,
            ])
            if (done) {
                return value
            }
            yield value
        }
    }()), () => {
        cancel({
            done: true,
            value: undefined,
        })
    })

    return Object.assign(cancelableIterator, {
        [isCancelableIterator]: true,
        onCancel,
        cancel,
    })
}
CancelableIterator.is = (it) => it[isCancelableIterator]

export function pipeline(...iterables) {
    const iterators = new Set()
    function done(err) {
        const its = new Set(iterators)
        iterators.clear()
        its.forEach((it) => {
            it.cancel(err)
        })
    }

    return iterables.reduce((prev, next) => {
        const it = CancelableIterator(async function* Gen() {
            try {
                const nextIterable = typeof next === 'function' ? next(prev) : next
                yield* nextIterable
            } catch (err) {
                done(err)
            }
        }())
        iterators.add(it)
        return it
    }, undefined)
}

/**
 * Iterates over a Stream
 * Cleans up stream/stops iterator if either stream or iterator ends.
 * Adds abort + end methods to iterator
 */

const isStreamIterator = Symbol('StreamIterator')

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
        [isStreamIterator]: true,
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
