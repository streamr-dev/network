/**
 * Track an AsyncIterable's behaviour with an EventEmitter.
 * Exposes strict emitter types and utilities.
 */

import Emitter from 'events'
import StrictEventEmitter from 'strict-event-emitter-types'
import { iteratorFinally } from './iterators'

export type AsyncIterableEventsBase<T> = {
    /** Fires once, at end of iteration */
    end: () => void
    /** Fires for each yielded value, before yielding value to consumer */
    message: (msg: T) => void
    /**
     * Fires before end if there was an error, rethrow error to throw iterator.
     * Won't emit if no error hander attached i.e. no unhandled error event
     */
    error: (error: Error) => void
}

type AsyncIterableEvents<T> = AsyncIterableEventsBase<T> & {
    // newListener event type doesn't come out of the box.
    // Uses MessageStreamEventsBase to get correct event types.
    newListener<E extends keyof AsyncIterableEventsBase<T>> (event: E, ...args: any[]): void
}

type StrictAsyncIterableEmitter<T> = StrictEventEmitter<Emitter, AsyncIterableEvents<T>>

// have to export this otherwise it complains
export type StrictAsyncIterableEmitterClass = {
    new<T>(...args: ConstructorParameters<typeof Emitter>): StrictAsyncIterableEmitter<T>
}

// add strict types
const AsyncIterableEmitterBase = Emitter as StrictAsyncIterableEmitterClass

/**
 * Doesn't implement any functionality, is just an Emitter with the correct interface.
 * Use utilities below to implement functionality.
 */
export default class AsyncIterableEmitter<T> extends AsyncIterableEmitterBase<T> {}

/**
 * Takes AsyncIterable & an Emitter.
 * converts:
 * AsyncIterable yield -> 'message' events
 * AsyncIterable errors -> 'error' event (will also emit 'end')
 * AsyncIterable finally  -> 'end' event
 */
export function asyncIterableWithEvents<T>(asyncIterable: AsyncIterable<T>, emitter: StrictAsyncIterableEmitter<T>) {
    return iteratorFinally((async function* AsyncIterableWithEventsWrap() {
        for await (const m of asyncIterable) {
            emitter.emit('message', m)
            yield m
        }
    }()), (err?: Error) => {
        try {
            if (err) {
                if (!emitter.listenerCount('error')) {
                    throw err
                }

                // emit error instead of throwing if some error listener
                emitter.emit('error', err)
            }
        } finally {
            emitter.emit('end')
            emitter.removeAllListeners('message')
            emitter.removeAllListeners('error')
            emitter.removeAllListeners('end')
        }
    })
}

/**
 * Start consuming the asyncIterable as soon as an on('message') handler is added to the emitter.
 * Careful not to iterate twice.
 */
export function flowOnMessageListener<T>(asyncIterable: AsyncGenerator<T>, emitter: StrictAsyncIterableEmitter<T>) {
    const consume = async () => {
        for await (const _ of asyncIterable) {
            // do nothing, just consume iterator
        }
    }

    const flow = () => {
        // start consuming
        // note this function returns a promise but we want to prevent
        // unhandled rejections so can't use async keyword as this introduces
        // a new promise we can't attach a catch handler to.
        // anything awaiting this promise will still get the rejection
        // it just won't trigger unhandledrejection
        const task = consume()
        task.catch(() => {}) // prevent unhandled
        return task
    }

    const onListener = (event: string | symbol) => {
        if (event === 'message') {
            // start flowing if/when message handler is added
            emitter.off('newListener', onListener)
            flow()
        }
    }

    emitter.on('newListener', onListener)
    emitter.once('end', () => {
        // clean up
        emitter.off('newListener', onListener)
    })

    return asyncIterable
}
