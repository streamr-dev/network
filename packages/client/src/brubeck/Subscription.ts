import { StreamMessage } from 'streamr-client-protocol'
import MessageStream from './MessageStream'
import SubscriptionSession from './SubscriptionSession'
import { validateOptions } from '../stream/utils'

export type SubscriptionOptions = {
  streamId: string,
  streamPartition: number
}

export type SubscriptionOnMessage<T> = (msg: T, streamMessage: StreamMessage<T>) => void
export default class Subscription<T> extends MessageStream<T> {
    context: SubscriptionSession<T>
    streamId: string
    streamPartition: number

    constructor(subSession: SubscriptionSession<T>) {
        const { key, streamId, streamPartition } = validateOptions(subSession)
        super(subSession, { idSuffix: key })
        this.context = subSession
        this.streamId = streamId
        this.streamPartition = streamPartition
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
