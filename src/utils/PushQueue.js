import { CancelableGenerator } from './iterators' // eslint-disable-line import/no-cycle

import { pOrderedResolve } from './index'

export class AbortError extends Error {
    constructor(msg = '', ...args) {
        super(`The operation was aborted. ${msg}`, ...args)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

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

export default class PushQueue {
    constructor(items = [], { signal, onEnd, timeout = 0, autoEnd = true } = {}) {
        this.autoEnd = autoEnd
        this.buffer = [...items]
        this.finished = false
        this.error = null // queued error
        this.nextQueue = [] // queued promises for next()
        this.pending = 0
        this._onEnd = onEnd
        this.timeout = timeout

        this[Symbol.asyncIterator] = this[Symbol.asyncIterator].bind(this)
        this.onAbort = this.onAbort.bind(this)
        this.onEnd = this.onEnd.bind(this)
        this.cancel = this.cancel.bind(this)
        this.end = this.end.bind(this)

        // abort signal handling
        this.signal = signal
        if (signal) {
            if (signal.aborted) {
                this.onAbort()
            }

            signal.addEventListener('abort', this.onAbort, {
                once: true
            })
        }

        this.iterator = this.iterate()
    }

    static from(iterable, opts = {}) {
        const queue = new PushQueue([], opts)
        queue.from(iterable)
        return queue
    }

    static transform(src, fn) {
        const buffer = new PushQueue()
        const orderedFn = pOrderedResolve(fn) // push must be run in sequence
        ;(async () => { // eslint-disable-line semi-style
            const tasks = []
            for await (const value of src) {
                // run in parallel
                const task = orderedFn(value).then(() => (
                    buffer.push(value)
                )).catch((err) => {
                    buffer.throw(err)
                })
                tasks.push(task)
            }
            await Promise.all(tasks)
            if (src.autoEnd) {
                await buffer.end()
            }
        })().catch((err) => {
            return buffer.throw(err)
        }) // no await

        return buffer
    }

    async from(iterable, { end = this.autoEnd } = {}) {
        try {
            // detect sync/async iterable and iterate appropriately
            if (!iterable[Symbol.asyncIterator]) {
                // sync iterables push into buffer immediately
                for (const item of iterable) {
                    this.push(item)
                }
            } else {
                for await (const item of iterable) {
                    this.push(item)
                }
            }
        } catch (err) {
            return this.throw(err)
        }

        if (end) {
            this.end()
        }

        return Promise.resolve()
    }

    onEnd(...args) {
        if (this._onEndCalled || !this._onEnd) {
            return Promise.resolve()
        }

        this._onEndCalled = true
        return this._onEnd(...args)
    }

    /**
     * signals no more data should be buffered
     */

    end(v) {
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

    async next(...args) {
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

    async throw(err) {
        this.finished = true
        const p = this.nextQueue.shift()
        if (p) {
            p.reject(err)
        } else {
            // for next()
            this.error = err
        }

        return this.return()
    }

    get length() {
        const count = this.pending + this.buffer.length
        return this.ended && count ? count - 1 : count
    }

    _cleanup() {
        this.finished = true
        for (const p of this.nextQueue) {
            p.resolve()
        }
        this.pending = 0
        this.buffer.length = 0
        return this.onEnd(this.error)
    }

    push(...values) {
        if (this.finished || this.ended) {
            // do nothing if done
            return
        }

        // if values contains null, treat null as end
        const nullIndex = values.findIndex((v) => v === null)
        if (nullIndex !== -1) {
            this.ended = true
            // include null but trim rest
            values = values.slice(0, nullIndex + 1) // eslint-disable-line no-param-reassign
        }

        // resolve pending next calls
        while (this.nextQueue.length && values.length) {
            const p = this.nextQueue.shift()
            p.resolve(values.shift())
        }

        // push any remaining values into buffer
        if (values.length) {
            this.buffer.push(...values)
        }
    }

    iterate() { // eslint-disable-line class-methods-use-this
        const handleTerminalValues = (value) => {
            // returns final task to perform before returning, or false
            if (value === null) {
                return this.return()
            }

            if (value instanceof Error) {
                return this.throw(value)
            }

            return false
        }

        const [cancel, itr] = CancelableGenerator(async function* iterate() {
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
                    this.error = null
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

                const value = await new Promise((resolve, reject) => {
                    // wait for next push
                    this.nextQueue.push({
                        resolve,
                        reject,
                    })
                })

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
        }.call(this), async (err) => {
            return this.onEnd(err)
        }, {
            timeout: this.timeout,
        })

        return Object.assign(itr, {
            cancel,
        })
    }

    pipe(next, opts) {
        return next.from(this, opts)
    }

    async cancel(...args) {
        this.finished = true
        return this.iterator.cancel(...args)
    }

    isCancelled(...args) {
        return this.iterator.isCancelled(...args)
    }

    async* [Symbol.asyncIterator]() {
        // NOTE: consider throwing if trying to iterate after finished
        // or maybe returning a new iterator?
        try {
            yield* this.iterator
        } finally {
            this.finished = true
            if (this.signal) {
                this.signal.removeEventListener('abort', this.onAbort, {
                    once: true,
                })
            }
        }
    }
}
