/**
 * Wrapper around PushPipeline specific to StreamMessages.
 * Subscriptions are MessageStreams.
 * Not all MessageStreams are Subscriptions.
 */
import { PushPipeline, PipelineTransform } from './utils/Pipeline'
import { instanceId } from './utils'
import { Context } from './utils/Context'
import { StreamMessage } from 'streamr-client-protocol'
import * as G from './utils/GeneratorUtils'

export type MessageStreamOnMessage<T, R = unknown> = (msg: T, streamMessage: StreamMessage<T>) => R | Promise<R>
/**
 * @category Important
 */
export default class MessageStream<
    T = unknown,
    InType = StreamMessage<T>,
    OutType extends StreamMessage<T> | unknown = InType
> extends PushPipeline<InType, OutType> {
    constructor(context: Context, { bufferSize, name = '' }: { bufferSize?: number, name?: string } = {}) {
        super(bufferSize)
        this.id = instanceId(this, name)
        this.debug = context.debug.extend(this.id)
    }

    /**
     * Attach a legacy onMessage handler and consume if necessary.
     * onMessage is passed parsed content as first arument, and streamMessage as second argument.
     */
    useLegacyOnMessageHandler(onMessage?: MessageStreamOnMessage<T>): this {
        if (onMessage) {
            this.onMessage(async (streamMessage) => {
                if (streamMessage instanceof StreamMessage) {
                    await onMessage(streamMessage.getParsedContent(), streamMessage)
                }
            })
        }

        setImmediate(() => {
            // consume if not already doing so
            if (!this.isIterating) {
                this.consume().catch(() => {}) // prevent unhandled
            }
        })

        return this
    }

    async collectContent() {
        const messages = await this.collect()
        return messages.map((streamMessage) => {
            if (streamMessage instanceof StreamMessage) {
                return streamMessage.getParsedContent()
            }
            return streamMessage
        })
    }

    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): MessageStream<T, InType, NewOutType> {
        // this method override just fixes the output type to be MessageStream rather than Pipeline
        super.pipe(fn)
        return this as MessageStream<T, InType, unknown> as MessageStream<T, InType, NewOutType>
    }

    pipeBefore(fn: PipelineTransform<InType, InType>): MessageStream<T, InType, OutType> {
        // this method override just fixes the output type to be MessageStream rather than Pipeline
        super.pipeBefore(fn)
        return this
    }

    map<NewOutType>(fn: G.GeneratorMap<OutType, NewOutType>): MessageStream<T, InType, NewOutType> {
        // this method override just fixes the output type to be MessageStream rather than Pipeline
        return super.map(fn) as MessageStream<T, InType, NewOutType>
    }

    filterBefore(fn: G.GeneratorFilter<InType>): MessageStream<T, InType, OutType> {
        // this method override just fixes the output type to be MessageStream rather than Pipeline
        return super.filterBefore(fn) as MessageStream<T, InType, OutType>
    }

    filter(fn: G.GeneratorFilter<OutType>): MessageStream<T, InType, OutType> {
        // this method override just fixes the output type to be MessageStream rather than Pipeline
        return super.filter(fn) as MessageStream<T, InType, OutType>
    }

    forEach(fn: G.GeneratorForEach<OutType>): MessageStream<T, InType, OutType> {
        // this method override just fixes the output type to be MessageStream rather than Pipeline
        return super.forEach(fn) as MessageStream<T, InType, OutType>
    }

    forEachBefore(fn: G.GeneratorForEach<InType>): MessageStream<T, InType, OutType> {
        // this method override just fixes the output type to be MessageStream rather than Pipeline
        return super.forEachBefore(fn) as MessageStream<T, InType, OutType>
    }
}
