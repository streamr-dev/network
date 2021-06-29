import Emitter, { captureRejectionSymbol } from 'events'
import StrictEventEmitter from 'strict-event-emitter-types'

import { instanceId } from '../utils'

import { Context } from './Context'
import PushQueue from '../utils/PushQueue'
import { StreamMessage } from 'streamr-client-protocol'

export type MessageStreamEventsBase<T> = {
    end: () => void
    message: (streamMessage: StreamMessage<T>) => void
    error: (error: Error) => void
}

type MessageStreamEvents<T> = MessageStreamEventsBase<T> & {
    // newListener event type doesn't come out of the box.
    // Uses MessageStreamEventsBase to get correct event types.
    newListener<E extends keyof MessageStreamEventsBase<T>> (event: E, ...args: any[]): void
}

// have to export this otherwise it complains
export type StrictMessageStreamEmitter = {
    new<T>(...args: ConstructorParameters<typeof Emitter>): StrictEventEmitter<Emitter, MessageStreamEvents<T>>
}

// add strict types
const MessageStreamEmitter = Emitter as StrictMessageStreamEmitter

/**
 * @category Important
 * Wraps PushQueue
 * Adds events & error handling
 */
export default class MessageStream<T> extends MessageStreamEmitter<T> implements Context {
    id: string
    /** @internal */
    context: Context
    /** @internal */
    buffer = new PushQueue<StreamMessage<T>>([])
    /** @internal */
    isIterating = false
    /** @internal */
    debug
    isErrored = false

    constructor(context: Context, { idSuffix }: { idSuffix?: string } = {}) {
        super({ captureRejections: true })
        this.context = context
        this.id = !idSuffix ? instanceId(this) : `${instanceId(this)}-${idSuffix}`
        this.debug = context.debug.extend(this.id)
        this.debug('create')
        this[Symbol.asyncIterator] = this[Symbol.asyncIterator].bind(this)
        this.on('newListener', this.onListener)
    }

    onListener = (event: string | symbol) => {
        if (event === 'message') {
            this.off('newListener', this.onListener)
            this.flow().catch(() => {})
        }
    }

    async handleError(err: Error) {
        if (this.listenerCount('error')) {
            // emit error instead of throwing if some error listener
            this.emit('error', err)
            return
        }
        await this.cancel(err)
        throw err
    }

    async flow() {
        try {
            for await (const msg of this) {
                try {
                    this.emit('message', msg)
                } catch (err) {
                    await this.handleError(err)
                }
            }
        } catch (err) {
            await this.handleError(err)
        }
    }

    [captureRejectionSymbol] = (error: Error, event: string | symbol) => {
        this.debug('rejection handling event %s with', event, error)
        return this.cancel(error)
    }

    /**
     * Collect n/all messages into an array.
     * Returns array when subscription is ended or n messages collected.
     */
    async collect(n?: number) {
        if (this.isIterating) {
            throw new Error('Cannot collect if already iterated or onMessage.')
        }

        const msgs = []
        try {
            for await (const msg of this) {
                if (n === 0) {
                    break
                }

                msgs.push(msg.getParsedContent())
                if (msgs.length === n) {
                    break
                }
            }
        } catch (err) {
            await this.handleError(err)
        }
        return msgs
    }

    async* [Symbol.asyncIterator]() {
        if (this.isIterating) {
            throw new Error('cannot iterate subscription more than once. Cannot iterate if message handler function was passed to subscribe.')
        }

        try {
            // only iterate sub once
            this.isIterating = true

            for await (const msg of this.buffer) {
                yield msg
            }
        } catch (err) {
            await this.handleError(err)
        } finally {
            this.emit('end')
            this.removeAllListeners()
        }
    }

    push(message: StreamMessage<T>) {
        return this.buffer.push(message)
    }

    from(source: AsyncIterable<StreamMessage<T>>) {
        return this.buffer.from(source)
    }

    async end(message?: StreamMessage<T> | Error) {
        return this.buffer?.end(message)
    }

    cancel = async (err?: Error) => {
        if (this.buffer?.isCancelled()) {
            return Promise.resolve(undefined)
        }

        return this.buffer?.cancel(err)
    }

    isCancelled = (): boolean => {
        return !!this.buffer?.isCancelled()
    }

    async return() {
        return this.buffer?.return()
    }

    async throw(error: Error) {
        return this.buffer?.throw(error)
    }
}
