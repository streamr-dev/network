import { PushPipeline } from '../utils/Pipeline'
import { instanceId } from '../utils'
import { Context } from '../utils/Context'
import { StreamMessage } from 'streamr-client-protocol'

/**
 * @category Important
 * Wraps PushQueue
 * Adds events & error handling
 */
export default class MessageStream<T, InType extends StreamMessage = StreamMessage<T>, OutType extends StreamMessage | unknown = InType>
    extends PushPipeline<InType, OutType> {

    constructor(context: Context, { bufferSize, name = '' }: { bufferSize?: number, name?: string } = {}) {
        super(bufferSize)
        this.id = instanceId(this, name)
        this.debug = context.debug.extend(this.id)
    }
}
