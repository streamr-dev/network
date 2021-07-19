import { PushPipeline, PipelineTransform } from '../utils/Pipeline'
import { instanceId } from '../utils'
import { Context } from '../utils/Context'
import { StreamMessage, MessageContent } from 'streamr-client-protocol'

/**
 * @category Important
 * Wraps PushQueue
 * Adds events & error handling
 */
export default class MessageStream<
    T extends MessageContent | unknown,
    InType extends StreamMessage = StreamMessage<T>,
    OutType extends StreamMessage | unknown = InType
> extends PushPipeline<InType, OutType> {

    constructor(context: Context, { bufferSize, name = '' }: { bufferSize?: number, name?: string } = {}) {
        super(bufferSize)
        this.id = instanceId(this, name)
        this.debug = context.debug.extend(this.id)
    }

    pipe<NewOutType>(fn: PipelineTransform<OutType, NewOutType>): MessageStream<T, InType, NewOutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        super.pipe(fn)
        return this as MessageStream<T, InType, unknown> as MessageStream<T, InType, NewOutType>
    }

    pipeBefore(fn: PipelineTransform<InType, InType>): MessageStream<T, InType, OutType> {
        // this method override just fixes the output type to be PushPipeline rather than Pipeline
        super.pipeBefore(fn)
        return this
    }
}
