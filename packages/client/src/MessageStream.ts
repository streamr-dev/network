import { PushPipeline, PipelineTransform } from './utils/Pipeline'
import { instanceId } from './utils'
import { Context } from './utils/Context'
import { StreamMessage } from 'streamr-client-protocol'
import * as G from './utils/GeneratorUtils'

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

    async collectContent() {
        const messages = await this.collect()
        return messages.map((m) => {
            // @ts-expect-error ugh
            if (m && typeof m === 'object' && typeof m.getParsedContent === 'function') {
                // @ts-expect-error ugh
                return m.getParsedContent()
            }
            return m
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
