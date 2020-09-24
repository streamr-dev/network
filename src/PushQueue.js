function createIterResult(value, done) {
    return {
        value,
        done: !!done,
    }
}

class AbortError extends Error {
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
 * @see https://github.com/nodejs/node/blob/e36ffb72bebae55091304da51837ca204367dc16/lib/events.js#L707-L826
 *
 * ```js
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
 * ```
 */

export default class PushQueue {
    constructor(items = [], { signal } = {}) {
        this.buffer = [...items]
        this.finished = false
        this.error = null // queued error
        this.nextQueue = [] // queued promises for next()

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
    }

    onAbort() {
        return this.throw(new AbortError())
    }

    async next() {
        // always feed from buffer first
        if (this.buffer.length) {
            return createIterResult(this.buffer.shift())
        }

        // handle queued error
        if (this.error) {
            const err = this.error
            this.error = null
            throw err
        }

        // done
        if (this.finished) {
            return createIterResult(undefined, true)
        }

        // wait for next push
        return new Promise((resolve, reject) => {
            this.nextQueue.push({
                resolve,
                reject,
            })
        })
    }

    async return() {
        this.finished = true
        if (this.signal) {
            this.signal.removeEventListener('abort', this.onAbort, {
                once: true,
            })
        }

        // clean up outstanding promises
        for (const p of this.nextQueue) {
            p.resolve(createIterResult(undefined, true))
        }

        return createIterResult(undefined, true)
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
        return this.buffer.length
    }

    push(...values) {
        if (this.finished) {
            // do nothing if done
            return
        }

        const p = this.nextQueue.shift()
        if (p) {
            const [first, ...rest] = values
            p.resolve(createIterResult(first))
            this.buffer.push(...rest)
        } else {
            this.buffer.push(...values)
        }
    }

    [Symbol.asyncIterator]() {
        // NOTE: consider throwing if trying to iterate after finished
        // or maybe returning a new iterator?
        return this
    }
}
