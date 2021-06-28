import Emitter, { captureRejectionSymbol } from 'events'
import StrictEventEmitter from 'strict-event-emitter-types'

import { counterId } from '../utils'
import { validateOptions } from '../stream/utils'

import { Context } from './Context'
import PushQueue from '../utils/PushQueue'
import { StreamMessage } from '../../../protocol/dist/src'
import { IStreamMessageEmitter } from './StreamMessageEmitter'

export type MessageStreamOptions = {
  streamId: string,
  streamPartition: number
}

const MessageStreamEmitter = Emitter as {
    new(): StrictEventEmitter<Emitter, IStreamMessageEmitter>
}

/**
 * @category Important
 */
export default class MessageStream<T> extends MessageStreamEmitter implements Context {
    id: string
    streamId: string
    streamPartition: number
    /** @internal */
    context: Context
    /** @internal */
    key: string
    /** @internal */
    stream = new PushQueue<StreamMessage>([])
    /** @internal */
    isIterating = false
    /** @internal */
    debug

    constructor(context: Context, opts: MessageStreamOptions) {
        // @ts-expect-error captureRejections isn't in strict event emitter interface
        super({ captureRejections: true })
        this.context = context
        const { streamId, streamPartition, key, id } = validateOptions(opts)
        this.id = `${counterId(`${this.constructor.name}`)}${id || ''}${key}`
        this.key = key
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.debug = context.debug.extend(this.id)
        this.debug('create')
        this.on('error', this.onError)
        this.on('newListener', this.onListener)
    }

    onListener = (event: string | symbol) => {
        if (event === 'message') {
            this.off('newListener', this.onListener)
            this.flow()
        }
    }

    async flow() {
        for await (const msg of this) {
            try {
                this.emit('message', msg)
            } catch (err) {
                this.emit('error', err)
            }
        }
    }

    onError = async (error: Error) => {
        if (this.listenerCount('error') > 1) {
            return
        }

        this.debug('emitting error but no error listeners, cancelling subscription', error)
        this.off('error', this.onError)
        await this.cancel(error)
    }

    [captureRejectionSymbol](error: Error, event: string | symbol) {
        this.debug('rejection handling event %s with', event, error)
        return this.cancel(error)
    }

    /**
     * Collect n/all messages into an array.
     * Returns array when subscription is ended or n messages collected.
     */
    async collect(n?: number) {
        const msgs = []
        for await (const msg of this) {
            if (n === 0) {
                break
            }

            msgs.push(msg.getParsedContent())
            if (msgs.length === n) {
                break
            }
        }

        return msgs
    }

    async* [Symbol.asyncIterator]() {
        try {
            // only iterate sub once
            if (this.isIterating) {
                throw new Error('cannot iterate subscription more than once. Cannot iterate if message handler function was passed to subscribe.')
            }

            this.isIterating = true

            for await (const msg of this.stream) {
                yield msg
            }
        } catch (err) {
            this.emit('error', err)
        } finally {
            this.emit('end')
            this.removeAllListeners()
        }
    }

    push(message: StreamMessage<T>) {
        return this.stream.push(message)
    }

    from(source: AsyncIterable<StreamMessage<T>>) {
        return this.stream.from(source)
    }

    async cancel(err?: Error) {
        return this.stream?.cancel(err)
    }

    async end(message?: StreamMessage<T>) {
        return this.stream?.end(message)
    }

    isCancelled(): boolean {
        return !!this.stream?.isCancelled()
    }

    async return() {
        return this.stream?.return()
    }

    async throw(error: Error) {
        return this.stream?.throw(error)
    }

}

