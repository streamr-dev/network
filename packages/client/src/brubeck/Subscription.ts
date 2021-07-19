import { MessageContent, StreamMessage, SPID, SPIDKeyShape } from 'streamr-client-protocol'
import MessageStream from './MessageStream'
import SubscriptionSession from './SubscriptionSession'
import { flow } from '../utils/PushBuffer'

export type SubscriptionOptions = {
  streamId: string,
  streamPartition: number
}

export type SubscriptionOnMessage<T> = (msg: T, streamMessage: StreamMessage<T>) => void

export default class Subscription<T extends MessageContent | unknown> extends MessageStream<T> implements SPIDKeyShape {
    context: SubscriptionSession<T>
    spid: SPID
    /** prevent buffered data from yielding */
    isUnsubscribed = false
    streamId
    streamPartition
    key

    constructor(subSession: SubscriptionSession<T>) {
        super(subSession)
        this.context = subSession
        this.spid = subSession.spid
        this.streamId = this.spid.streamId
        this.streamPartition = this.spid.streamPartition
        this.key = this.spid.key
    }

    onMessage(onMessageFn: SubscriptionOnMessage<T>): Promise<void> {
        return flow((async function* onMessageIterator(this: Subscription<T>) {
            for await (const msg of this) {
                onMessageFn(msg.getParsedContent(), msg)
                yield msg
            }
        }.call(this)))
    }

    count() {
        return this.context.count()
    }

    async unsubscribe() {
        this.end()
        await this.return()
    }
}
