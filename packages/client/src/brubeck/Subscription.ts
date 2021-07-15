import { MessageContent, StreamMessage, SPID, SPIDObject } from 'streamr-client-protocol'
import MessageStream from './MessageStream'
import SubscriptionSession from './SubscriptionSession'

export type SubscriptionOptions = {
  streamId: string,
  streamPartition: number
}

export type SubscriptionOnMessage<T> = (msg: T, streamMessage: StreamMessage<T>) => void

export default class Subscription<T extends MessageContent | unknown> extends MessageStream<T> implements SPIDObject {
    context: SubscriptionSession<T>
    spid: SPID
    /** prevent buffered data from yielding */
    isUnsubscribed = false
    streamId
    streamPartition

    constructor(subSession: SubscriptionSession<T>) {
        super(subSession)
        this.context = subSession
        this.spid = subSession.spid
        this.streamId = this.spid.id
        this.streamPartition = this.spid.partition
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
