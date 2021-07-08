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
    /** prevent buffered data from yielding */
    isUnsubscribed = false

    constructor(subSession: SubscriptionSession<T>) {
        super(subSession)
        const { key, streamId, streamPartition } = validateOptions(subSession)
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

    async* iterate() {
        for await (const msg of super.iterate()) {
            if (this.isUnsubscribed) { break }
            yield msg
        }
    }

    async unsubscribe() {
        this.isUnsubscribed = true
        await this.return()
    }
}
