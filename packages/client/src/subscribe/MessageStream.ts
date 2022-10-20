/**
 * Wrapper around PushPipeline specific to StreamMessages.
 * Subscriptions are MessageStreams.
 * Not all MessageStreams are Subscriptions.
 */
import { PushPipeline } from '../utils/PushPipeline'
import { StreamMessage } from 'streamr-client-protocol'

export class MessageStream<
    T = unknown,
    InType = StreamMessage<T>,
    OutType extends StreamMessage<T> | unknown = InType
> extends PushPipeline<InType, OutType> {
}
