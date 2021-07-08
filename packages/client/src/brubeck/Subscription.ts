import { MessageContent, StreamMessage } from 'streamr-client-protocol'
import MessageStream from './MessageStream'
import SubscriptionSession from './SubscriptionSession'
import { validateOptions } from '../stream/utils'

export type SubscriptionOptions = {
  streamId: string,
  streamPartition: number
}

export type SubscriptionOnMessage<T> = (msg: T, streamMessage: StreamMessage<T>) => void

export default class Subscription<T extends MessageContent | unknown> extends MessageStream<T> {
    context: SubscriptionSession<T>
    key: string
    streamId: string
    streamPartition: number

    constructor(subSession: SubscriptionSession<T>) {
        const { key, streamId, streamPartition } = validateOptions(subSession)
        super(subSession, { idSuffix: key })
        this.context = subSession
        this.key = key
        this.streamId = streamId
        this.streamPartition = streamPartition
    }

    onMessage(onMessageFn: SubscriptionOnMessage<T>) {
        this.on('message', (streamMessage) => {
            const msg = streamMessage
            onMessageFn(msg.getParsedContent(), msg)
        })
    }

    count() {
        return this.context.count()
    }

    unsubscribe() {
        return this.cancel()
    }
}
