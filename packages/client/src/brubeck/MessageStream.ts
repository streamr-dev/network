import { captureRejectionSymbol } from 'events'

import { instanceId } from '../utils'
import AsyncIterableEmitter, { flowOnMessageListener, asyncIterableWithEvents } from '../utils/AsyncIterableEmitter'
import { Context, ContextError } from '../utils/Context'
import { PushBuffer, pull } from '../utils/PushBuffer'
import { Pipeline, IPipeline, PipelineGeneratorFunction } from '../utils/Pipeline'
import { StreamMessage } from 'streamr-client-protocol'

class MessageStreamError extends ContextError {}

function isStreamMessage(msg: any): msg is StreamMessage {
    return msg !== null && typeof msg === 'object' && typeof msg.getParsedContent === 'function'
}

/**
 * @category Important
 * Wraps PushQueue
 * Adds events & error handling
 */
export default class MessageStream<T, InType extends StreamMessage = StreamMessage<T>, OutType extends StreamMessage | unknown = InType>
    extends AsyncIterableEmitter<OutType>
    implements IPipeline<InType, OutType> {
    readonly id: string
    /** @internal */
    readonly debug
    /** @internal */
    buffer: PushBuffer<InType>
    /** @internal */
    isIterating = false
    isErrored = false
    didStart = false
    pipeline: Pipeline<InType, OutType>
    iterator: AsyncGenerator<OutType>

    constructor(context: Context, { bufferSize, name = '' }: { bufferSize?: number, name?: string } = {}) {
        super({ captureRejections: true })
        this.id = instanceId(this, name)
        this.debug = context.debug.extend(this.id)
        // this.debug('create')
        this[Symbol.asyncIterator] = this[Symbol.asyncIterator].bind(this)
        this.buffer = new PushBuffer<InType>(bufferSize, { name })
        this.pipeline = new Pipeline<InType, OutType>(this.buffer).pipe(async function* PipelineMessage(src) { yield* src })
        this.iterator = asyncIterableWithEvents<OutType>(this.iterate(), this)
        flowOnMessageListener(this, this)
    }

    [captureRejectionSymbol] = (error: Error, event: string | symbol) => {
        this.debug('!rejection handling event %s with', event, error)
    }

    /**
     * Collect n/all messages into an array.
     * Returns array when subscription is ended or n messages collected.
     */
    async collect(n?: number) {
        if (this.isIterating) {
            throw new MessageStreamError(this, 'Cannot collect if already iterated or onMessage.')
        }

        const msgs = []
        for await (const msg of this) {
            if (n === 0) {
                break
            }

            // get parsed content if value is StreamMessage
            if (isStreamMessage(msg)) {
                msgs.push(msg.getParsedContent())
            } else {
                msgs.push(msg)
            }

            if (msgs.length === n) {
                break
            }
        }
        return msgs
    }

    async* iterate() {
        this.didStart = true
        yield* this.pipeline
    }

    [Symbol.asyncIterator]() {
        if (this.isIterating) {
            throw new Error('cannot iterate subscription more than once. Cannot iterate if message handler function was passed to subscribe.')
        }
        // only iterate sub once
        this.isIterating = true
        return this.iterator
    }

    get length() {
        return Math.max(this.buffer.length, this.pipeline.length)
    }

    push(message: InType) {
        return this.buffer.push(message)
    }

    from(source: AsyncGenerator<InType>) {
        return pull(source, this.buffer)
    }

    end(error?: Error) {
        return this.buffer.end(error)
    }

    pipe<NewOutType>(fn: PipelineGeneratorFunction<OutType, NewOutType>) {
        this.pipeline.pipe(fn)
        return this as unknown as MessageStream<T, InType, NewOutType>
    }

    finally(onFinally: ((err?: Error) => void | Promise<void>)) {
        this.pipeline.finally(onFinally) // eslint-disable-line promise/catch-or-return
        return this
    }

    next() {
        return this.iterator.next()
    }

    async return(v?: OutType) {
        this.buffer.end() // prevents deadlock
        if (!this.didStart) {
            await this.pipeline.return()
        }
        return this.iterator.return(v)
    }

    async throw(error: Error) {
        this.buffer.end() // prevents deadlock
        if (!this.didStart) {
            await this.pipeline.throw(error)
        }
        return this.iterator.throw(error)
    }
}
