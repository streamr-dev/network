import { Defer, pTimeout, instanceId, pOnce, Gate } from './index'
import { iteratorFinally, MaybeCancelable } from './iterators'
import { Debug } from './log'

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

function isError(err: any): err is Error {
    if (!err) { return false }

    if (err instanceof Error) { return true }

    return !!(
        err
        && err.stack
        && err.message
        && typeof err.stack === 'string'
        && typeof err.message === 'string'
    )
}

type TerminalValue = Error | null

function isTerminalValue(v: any): v is TerminalValue {
    return v === null || isError(v)
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
    name: string,
    signal: AbortSignal,
    onEnd: (err?: Error, ...args: any[]) => void
    highWaterMark: number,
    timeout: number,
    autoEnd: boolean,
}>

export default class PushQueue<T> {
    id
    debug
    autoEnd
    timeout
    signal
    private bufferGate = new Gate()
    endTask = Defer()
    iterator: MaybeCancelable<AsyncGenerator<T>>
    buffer: T[] | [...T[], TerminalValue]
    isBufferWritable = true
    isBufferReadable = true
    error?: Error// queued error
    nextQueue: (ReturnType<typeof Defer>)[] = [] // queued promises for next()
    pending: number = 0
    highWaterMark: number
    _onEnd: PushQueueOptions['onEnd']
    isStarted = false

    constructor(items: T[] = [], {
        name,
        signal,
        onEnd,
        timeout = 0,
        highWaterMark = 1024,
        autoEnd = true
    }: PushQueueOptions = {}) {
        this.id = instanceId(this, name)
        this.debug = Debug(this.id)
        this.debug('create')
        this.autoEnd = autoEnd
        this.timeout = timeout
        this._onEnd = onEnd
        this.buffer = [...items]
        this.highWaterMark = highWaterMark

        this[Symbol.asyncIterator] = this[Symbol.asyncIterator].bind(this)
        this.iterator = iteratorFinally(this.iterate(), this._cleanup) as AsyncGenerator<T>
        // abort signal handling
        if (signal) {
            this.signal = signal
            signal.addEventListener('abort', this.onAbort, {
                once: true
            })
        }
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
                await buffer.push(fn(value))
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
                    if (!this.isBufferWritable) {
                        this.debug('not writable 1')
                        break
                    }

                    await this.push(item)
                    if (!this.isBufferWritable) {
                        this.debug('not writable 2')
                        break
                    }
                }
            } else if ((Symbol.iterator || Symbol.for('Symbol.iterator')) in iterable) {
                if (this.isBufferWritable) {
                    // sync iterables push into buffer immediately
                    await this.push(...iterable as Iterable<T>)
                }
            }
        } catch (err) {
            await this.push(err)
        }

        if (end) {
            await this.end()
        }
    }

    pipe(next: PushQueue<unknown>, opts: Parameters<PushQueue<unknown>['from']>[1]) {
        return next.from(this, opts)
    }

    onEnd = pOnce((err?: Error, ...args: any[]) => {
        if (!this._onEnd) {
            if (err) {
                throw err
            }

            return Promise.resolve()
        }

        return this._onEnd(err, ...args)
    })

    /**
     * signals no more data should be buffered
     */

    end = pOnce(async (v?: T | TerminalValue) => {
        if (!this.isBufferReadable || !this.isBufferWritable) {
            await this._cleanup()
            return
        }

        this.debug('end')

        if (v != null) {
            await this.push(v)
        }

        await this.push(null)
    })

    private onAbort = pOnce(() => {
        // nobody to listen
        return this.cancel(new AbortError()).catch(() => {})
    })

    async next(...args:[] | [unknown]) {
        return this.iterator.next(...args)
    }

    isWritable() {
        return this.isBufferWritable
    }

    isReadable() {
        return this.isBufferReadable
    }

    get length() {
        if (!this.isBufferReadable) {
            return 0
        }

        const count = this.pending + this.buffer.length
        const last = this.buffer[this.buffer.length - 1]
        if (isTerminalValue(last)) {
            return count - 1
        }

        return count
    }

    return = async (v?: T) => {
        this.isBufferWritable = false
        this.isBufferReadable = false
        await this._cleanup()
        return v
    }

    throw = pOnce(async (err: Error) => {
        if (!this.isBufferReadable) {
            await this._cleanup()
            return
        }

        this.isBufferWritable = false
        this.isBufferReadable = false
        this.debug('throw')
        const p = this.nextQueue.shift()
        if (p) {
            p.reject(err)
        }
        this.error = err

        if (!this.isStarted) {
            this.debug('not started', this.error)
            await this._cleanup()
        }
    })

    cancel = pOnce(async (error?: Error) => {
        if (!this.isBufferReadable) {
            await this._cleanup()
            return
        }

        this.isBufferWritable = false
        this.isBufferReadable = false
        if (error && !this.error) {
            this.error = error
        }
        this.debug('cancel. Queued next: %d, buffered data: %d', this.nextQueue.length, this.buffer.length)
        await endGeneratorTimeout(this.iterator, {
            timeout: this.timeout,
            error,
        })

        await this._cleanup()
    })

    isCancelled = () => {
        return !this.isBufferReadable
    }

    _cleanup = pOnce(async () => {
        this.debug('cleanup')

        if (this.signal) {
            this.signal.removeEventListener('abort', this.onAbort)
        }

        // capture error and pending next promises
        const { error, nextQueue } = this
        this.bufferGate.lock()
        this.isBufferReadable = false
        this.isBufferWritable = false
        this.pending = 0
        // empty buffer then reassign
        this.buffer.length = 0
        this.buffer = []
        // reassign nextQueue, emptying would mutate value we captured
        this.nextQueue = []
        const doneValue = { value: undefined, done: true }
        // resolve all pending next promises
        while (nextQueue.length) {
            const p = nextQueue.shift()
            if (!p) { continue }

            if (error) {
                p.reject(error)
            } else {
                p.resolve(doneValue)
            }
        }

        return this.onEnd(error)
    })

    async push(...values: (T | TerminalValue)[]) {
        // if values contains null, treat null as end
        const endIndex = values.findIndex((v) => v === null || isError(v))
        let validValues = values as T[]
        if (endIndex !== -1) {
            this.isBufferWritable = false
            // include end but trim rest
            validValues = values.slice(0, endIndex + 1) as T[]
        }

        // resolve pending next calls
        // note: should not be possible to have queued next calls
        // AND buffered items, so no chance of skipping queue
        while (this.nextQueue.length && validValues.length) {
            const p = this.nextQueue.shift()
            if (p) {
                const value = validValues.shift()
                if (isError(value)) {
                    p.reject(value)
                } else {
                    p.resolve(value)
                }
            }
        }

        // push any remaining values into buffer
        if (validValues.length) {
            this.buffer.push(...validValues)
        }

        await this.bufferReady()
    }

    updateGate() {
        if (this.length > this.highWaterMark) {
            if (this.bufferGate.isOpen()) {
                this.debug('pause')
            }
            this.bufferGate.close()
        } else {
            if (!this.bufferGate.isOpen()) {
                this.debug('resume')
            }
            this.bufferGate.open()
        }
    }

    async bufferReady() {
        this.updateGate()
        return this.bufferGate.check()
    }

    private handleTerminalValues(value: T | TerminalValue) {
        // returns final task to perform before returning, or false
        if (value === null) {
            return this.return()
        }

        if (isError(value)) {
            return this.throw(value)
        }

        return false
    }

    iterate() {
        return async function* iterate(this: PushQueue<T>) {
            /* eslint-disable no-await-in-loop */
            while (true) {
                if (this.signal && this.signal.aborted) {
                    await this.cancel(new AbortError())
                    return
                }

                this.updateGate()

                // feed from buffer first
                const buffer = this.buffer.slice()
                this.pending += buffer.length
                this.buffer.length = 0 // prevent endless loop
                while (buffer.length && !this.error && this.isBufferReadable) {
                    this.pending = Math.max(this.pending - 1, 0)
                    const value = (buffer.shift() as T | null | Error)
                    const endTask = this.handleTerminalValues(value)
                    if (endTask) {
                        await endTask
                        break
                    }

                    yield value as T // value can not be null
                }

                // handle error
                if (this.error) {
                    const err = this.error
                    this.debug('error')
                    throw err
                }

                // done
                if (!this.isBufferReadable) {
                    return
                }

                // if more items have been buffered, continue loop
                if (this.buffer.length) {
                    continue // eslint-disable-line no-continue
                }

                const deferred = Defer<T>()
                deferred.catch(() => {}) // prevent unhandledrejection
                this.nextQueue.push(deferred)
                const value = await deferred

                // ignore value if finished
                if (!this.isBufferReadable) {
                    return
                }

                const endTask = this.handleTerminalValues(value)
                if (endTask) {
                    await endTask
                    continue // eslint-disable-line no-continue
                }

                yield value
            }
            /* eslint-enable no-await-in-loop */
        }.call(this)
    }

    async* [Symbol.asyncIterator]() {
        if (this.error) {
            throw this.error
        }
        // NOTE: consider throwing if trying to iterate after finished
        // or maybe returning a new iterator?
        this.isStarted = true
        try {
            for await (const v of this.iterator) {
                this.debug('yield', v)
                yield v
            }
        } finally {
            this.debug('iterated')
            await this._cleanup()
        }
    }
}
