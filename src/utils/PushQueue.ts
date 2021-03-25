import { pOrderedResolve, Defer, pTimeout } from './index'

async function endGenerator(gtr: AsyncGenerator, error?: Error) {
    return error
        ? gtr.throw(error).catch(() => {}) // ignore err
        : gtr.return(undefined)
}

type EndGeneratorTimeoutOptions = {
    timeout?: number
    error?: Error
}

async function endGeneratorTimeout(
    gtr: AsyncGenerator,
    {
        timeout = 250,
        error,
    }: EndGeneratorTimeoutOptions = {}
) {
    return pTimeout(endGenerator(gtr, error), {
        timeout,
        rejectOnTimeout: false,
    })
}

export class AbortError extends Error {
    constructor(msg = '') {
        super(`The operation was aborted. ${msg}`)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

type AnyIterable<T> = Iterable<T> | AsyncIterable<T>

/**
 * Async Iterable PushQueue
 * On throw/abort any items in buffer will be flushed before iteration throws.
 * Heavily based on (upcoming) events.on API in node:
 * https://github.com/nodejs/node/blob/e36ffb72bebae55091304da51837ca204367dc16/lib/events.js#L707-L826
 *
 * const queue = new PushQueue([item1], {
 *     signal: abortController.signal // optional
 * })
 * queue.push(item2, item3) // supports pushing multiple at once
 * setTimeout(() => {
 *    queue.push(item4) // push asynchronously, iterator will wait
 *    queue.return() // need to explicitly end iteration or it will continue forever
 *    queue.throw(err) // force the queue to throw
 *    abortController.abort() // alternative
 * })
 *
 * try {
 *     for await (const m of queue) {
 *         console.log(m)
 *         break // this calls await queue.return()
 *     }
 * } catch (err) {
 *     // queue threw an error
 * } finally {
 *     // run clean up after iteration success/error
 * }
 *
 */

type PushQueueOptions = Partial<{
    signal: AbortSignal,
    onEnd: (err?: Error, ...args: any[]) => void
    timeout: number,
    autoEnd: boolean,
}>

export default class PushQueue<T> {
    autoEnd
    timeout
    signal
    iterator
    buffer: T[] | [...T[], null]
    error?: Error// queued error
    nextQueue: (ReturnType<typeof Defer>)[] = [] // queued promises for next()
    finished = false
    pending: number = 0
    ended = false
    _onEnd: PushQueueOptions['onEnd']
    _onEndCalled = false
    _isCancelled = false

    constructor(items: T[] = [], {
        signal,
        onEnd,
        timeout = 0,
        autoEnd = true
    }: PushQueueOptions = {}) {
        this.autoEnd = autoEnd
        this.timeout = timeout
        this._onEnd = onEnd
        this.buffer = [...items]

        this[Symbol.asyncIterator] = this[Symbol.asyncIterator].bind(this)
        this.onAbort = this.onAbort.bind(this)
        this.onEnd = this.onEnd.bind(this)
        this.cancel = this.cancel.bind(this)
        this.isCancelled = this.isCancelled.bind(this)
        this.end = this.end.bind(this)

        // abort signal handling
        if (signal) {
            this.signal = signal
            if (signal.aborted) {
                this.onAbort()
            }

            signal.addEventListener('abort', this.onAbort, {
                once: true
            })
        }

        this.iterator = this.iterate()
    }

    static from<TT>(iterable: AnyIterable<TT>, opts = {}) {
        const queue = new PushQueue<TT>([], opts)
        queue.from(iterable)
        return queue
    }

    static transform<TT, U>(src: AnyIterable<TT>, fn: (value: TT) => U, opts = {}) {
        const buffer = new PushQueue<U>([], opts)
        ;(async () => { // eslint-disable-line semi-style
            for await (const value of src) {
                buffer.push(fn(value))
            }
            if (buffer.autoEnd) {
                buffer.end()
            }
        })().catch((err) => {
            return buffer.throw(err)
        }) // no await

        return buffer
    }

    async from(iterable: Iterable<T> | AsyncIterable<T>, { end = this.autoEnd } = {}) {
        try {
            // detect sync/async iterable and iterate appropriately
            if ((Symbol.asyncIterator || Symbol.for('Symbol.asyncIterator')) in iterable) {
                for await (const item of iterable as AsyncIterable<T>) {
                    this.push(item)
                }
            } else if ((Symbol.iterator || Symbol.for('Symbol.iterator')) in iterable) {
                // sync iterables push into buffer immediately
                for (const item of iterable as Iterable<T>) {
                    this.push(item)
                }
            }
        } catch (err) {
            return this.throw(err)
        }

        if (end) {
            await this.end()
        }

        return Promise.resolve()
    }

    onEnd(err?: Error, ...args: any[]) {
        if (this._onEndCalled || !this._onEnd) {
            return Promise.resolve()
        }

        this._onEndCalled = true
        return this._onEnd(err, ...args)
    }

    /**
     * signals no more data should be buffered
     */

    end(v?: T | null) {
        if (this.ended) {
            return
        }

        if (v != null) {
            this.push(v)
        }

        this.push(null)
        this.ended = true
    }

    onAbort() {
        return this.throw(new AbortError())
    }

    async next(...args:[] | [unknown]) {
        return this.iterator.next(...args)
    }

    isWritable() {
        return !(this.finished || this.ended)
    }

    isReadable() {
        return !(this.finished || this.ended)
    }

    async return() {
        this.finished = true
        await this._cleanup()
    }

    async throw(err: Error) {
        if (this.finished) {
            return
        }

        this.finished = true
        const p = this.nextQueue.shift()
        if (p) {
            p.reject(err)
        } else {
            // for next()
            this.error = err
        }

        await this._cleanup()
    }

    get length() {
        const count = this.pending + this.buffer.length
        return this.ended && count ? count - 1 : count
    }

    async _cleanup() {
        this.finished = true
        const { error } = this
        const queue = this.nextQueue
        this.error = undefined
        this.nextQueue = []
        this.pending = 0
        this.buffer.length = 0
        while (queue.length) {
            const p = queue.shift()
            if (!p) { continue }

            if (error) {
                p.reject(error)
            } else {
                p.resolve(undefined)
            }
        }

        return this.onEnd(error)
    }

    push(...values: (T | null)[]) {
        if (this.finished || this.ended) {
            // do nothing if done
            return
        }

        // if values contains null, treat null as end
        const nullIndex = values.findIndex((v) => v === null)
        let validValues = values as T[]
        if (nullIndex !== -1) {
            this.ended = true
            // include null but trim rest
            validValues = values.slice(0, nullIndex + 1) as T[]
        }

        // resolve pending next calls
        while (this.nextQueue.length && validValues.length) {
            const p = this.nextQueue.shift()
            if (p) {
                p.resolve(validValues.shift())
            }
        }

        // push any remaining values into buffer
        if (validValues.length) {
            this.buffer.push(...validValues)
        }
    }

    iterate() {
        const handleTerminalValues = (value: null | Error | any) => {
            // returns final task to perform before returning, or false
            if (value === null) {
                return this.return()
            }

            if (value instanceof Error) {
                return this.throw(value)
            }

            return false
        }

        return async function* iterate(this: PushQueue<T>) {
            while (true) {
                /* eslint-disable no-await-in-loop */
                // feed from buffer first
                const buffer = this.buffer.slice()
                this.pending += buffer.length
                this.buffer.length = 0 // prevent endless loop
                while (buffer.length && !this.error && !this.finished) {
                    this.pending = Math.max(this.pending - 1, 0)
                    const value = buffer.shift()
                    const endTask = handleTerminalValues(value)
                    if (endTask) {
                        await endTask
                        break
                    }

                    yield value
                }

                // handle queued error
                if (this.error) {
                    const err = this.error
                    this.error = undefined
                    throw err
                }

                // done
                if (this.finished) {
                    return
                }

                // if more items have been buffered, continue loop
                if (this.buffer.length) {
                    continue // eslint-disable-line no-continue
                }

                const deferred = Defer<T>()
                this.nextQueue.push(deferred)
                deferred.catch(() => {}) // prevent unhandledrejection
                const value = await deferred

                // ignore value if finished
                if (this.finished) {
                    return
                }

                const endTask = handleTerminalValues(value)
                if (endTask) {
                    await endTask
                    continue // eslint-disable-line no-continue
                }

                yield value
                /* eslint-enable no-await-in-loop */
            }
        }.call(this)
    }

    pipe(next: PushQueue<unknown>, opts: Parameters<PushQueue<unknown>['from']>[1]) {
        return next.from(this, opts)
    }

    async cancel(error?: Error) {
        this.finished = true
        this._isCancelled = true
        if (error) {
            this.error = error
        }
        await endGeneratorTimeout(this.iterator, {
            timeout: this.timeout,
            error,
        })

        return this.return()
    }

    isCancelled() {
        return this._isCancelled
    }

    async* [Symbol.asyncIterator]() {
        // NOTE: consider throwing if trying to iterate after finished
        // or maybe returning a new iterator?
        try {
            yield* this.iterator
        } finally {
            this._cleanup()
            this.finished = true
            if (this.signal) {
                this.signal.removeEventListener('abort', this.onAbort)
            }
            await this.onEnd(this.error)
        }
    }
}
