import { StreamMessage } from 'streamr-client-protocol'
import MessageStream, { MessageStreamOptions } from './MessageStream'
import SubscriptionSession from './SubscriptionSession'

export type SubscriptionOnMessage<T> = (msg: T, streamMessage: StreamMessage<T>) => void
export default class Subscription<T> extends MessageStream<T> {
    context: SubscriptionSession<T>
    streamId
    streamPartition

    constructor(subSession: SubscriptionSession<T>, opts: MessageStreamOptions) {
        super(subSession, opts)
        this.context = subSession
        this.streamId = subSession.options.streamId
        this.streamPartition = subSession.options.streamPartition
    }

    onMessage(onMessageFn: SubscriptionOnMessage<T>) {
        this.on('message', (streamMessage: StreamMessage) => {
            const msg = streamMessage as StreamMessage<T>
            onMessageFn(msg.getParsedContent(), msg)
        })
    }

    count() {
        return this.context.count()
    }

    unsubscribe() {
        return this.end()
    }
}
