import { CancelableGenerator } from './iterators'

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
    constructor(items = [], { signal, onEnd } = {}) {
        this.buffer = [...items]
        this.finished = false
        this.error = null // queued error
        this.nextQueue = [] // queued promises for next()
        this.pending = 0
        this.onEnd = onEnd

        this[Symbol.asyncIterator] = this[Symbol.asyncIterator].bind(this)
        this.onAbort = this.onAbort.bind(this)

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

    static from(iterable, opts) {
        const queue = new PushQueue([], opts)
        queue.from(iterable)
        return queue
    }

    async from(iterable) {
        try {
            for await (const item of iterable) {
                this.push(item)
            }
            return this.return()
        } catch (err) {
            return this.throw(err)
        }
    }

    onAbort() {
        return this.throw(new AbortError())
    }

    async next(...args) {
        return this.iterator.next(...args)
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
        return this.pending + this.buffer.length
    }

    _cleanup() {
        this.finished = true
        for (const p of this.nextQueue) {
            p.resolve()
        }
        this.pending = 0
        this.buffer.length = 0
    }

    push(...values) {
        if (this.finished) {
            // do nothing if done
            return
        }

        if (!values.length) { return }
        const p = this.nextQueue.shift()
        if (p) {
            const [first, ...rest] = values
            p.resolve(first)
            if (rest.length) {
                this.buffer.push(...rest)
            }
        } else {
            this.buffer.push(...values)
        }
    }

    iterate() { // eslint-disable-line class-methods-use-this
        const [cancel, itr] = CancelableGenerator(async function* iterate() {
            while (true) {
                // feed from buffer first
                const buffer = this.buffer.slice()
                this.pending += buffer.length
                this.buffer.length = 0 // prevent endless loop
                while (buffer.length && !this.error && !this.finished) {
                    this.pending = Math.max(this.pending - 1, 0)
                    yield buffer.shift()
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

                // eslint-disable-next-line no-await-in-loop
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

                yield value
            }
        }.call(this), this.onEnd)

        return Object.assign(itr, {
            cancel,
        })
    }

    cancel(...args) {
        this.finished = true
        return this.iterator.cancel(...args)
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
