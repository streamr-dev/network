import { captureRejectionSymbol } from 'events'

import { instanceId, Defer, Deferred, pOnce } from '../utils'
import AsyncIterableEmitter, { flowOnMessageListener, asyncIterableWithEvents } from '../utils/AsyncIterableEmitter'
import { Context, ContextError } from '../utils/Context'
import { PushBuffer, pull } from '../utils/PushBuffer'
import { Pipeline, IPipeline, PipelineTransform, FinallyFn } from '../utils/Pipeline'
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
    isDone = false
    private finallyTasks: FinallyFn[] = []
    private onDone: Deferred<void>

    constructor(context: Context, { bufferSize, name = '' }: { bufferSize?: number, name?: string } = {}) {
        super({ captureRejections: true })
        this.id = instanceId(this, name)
        this.debug = context.debug.extend(this.id)
        // this.debug('create')
        this[Symbol.asyncIterator] = this[Symbol.asyncIterator].bind(this)
        this.buffer = new PushBuffer<InType>(bufferSize, { name })
        this.pipeline = new Pipeline<InType, OutType>(this.buffer).pipe(async function* PipelineMessage(src) { yield* src })
        this.iterator = asyncIterableWithEvents<OutType>(this.iterate(), this)
        this.runFinally = pOnce(this.runFinally.bind(this))
        flowOnMessageListener(this, this)
        this.onDone = Defer()
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

    [Symbol.asyncIterator]() {
        if (this.isIterating) {
            throw new Error('cannot iterate subscription more than once. Cannot iterate if message handler function was passed to subscribe.')
        }

        // only iterate sub once
        this.isIterating = true
        return this
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

    endWrite(error?: Error) {
        return this.buffer.endWrite(error)
    }

    end(error?: Error) {
        return this.buffer.end(error)
    }

    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>) {
        this.pipeline.pipe(fn)
        return this as unknown as MessageStream<T, InType, NewOutType>
    }

    onFinally(onFinallyFn: FinallyFn) {
        this.finallyTasks.push(onFinallyFn)
        return this
    }

    async* iterate() {
        yield* this.pipeline
    }

    private async runFinally(err?: Error) {
        let error = err
        try {
            await this.finallyTasks.reduce(async (prev, task) => {
                return prev.then(() => task(error), (internalErr) => {
                    error = internalErr
                    return task(error)
                })
            }, Promise.resolve()) // eslint-disable-line promise/no-promise-in-callback
        } finally {
            this.onDone.resolve(undefined)
        }
    }

    async next() {
        this.didStart = true
        return this.iterator.next()
    }

    async return(v?: OutType) {
        if (this.isDone) {
            await this.onDone
            const result: IteratorResult<OutType> = { done: true, value: v }
            return result
        }

        this.isDone = true
        this.buffer.endWrite()

        try {
            if (!this.didStart) {
                await this.pipeline.return()
            }

            return await this.iterator.return(v)
        } finally {
            await this.runFinally()
        }
    }

    async throw(error: Error) {
        if (this.isDone) {
            await this.onDone
            throw error
        }

        this.isDone = true
        this.buffer.endWrite(error)

        try {
            if (!this.didStart) {
                await this.pipeline.return()
            }

            return await this.iterator.throw(error)
        } finally {
            await this.runFinally()
        }
    }
}
