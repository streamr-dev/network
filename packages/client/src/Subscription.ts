import { MessageContent, StreamMessage, SPID, SPIDKeyShape } from 'streamr-client-protocol'
import MessageStream from './MessageStream'
import SubscriptionSession from './SubscriptionSession'
import Signal from './utils/Signal'

export type SubscriptionOptions = {
  streamId: string,
  streamPartition: number
}

export type SubscriptionOnMessage<T> = (msg: T, streamMessage: StreamMessage<T>) => void

export default class Subscription<T extends MessageContent | unknown = unknown> extends MessageStream<T> implements SPIDKeyShape {
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
        // this.debug('create', this.key, new Error('Subscription').stack)
    }

    onError = Signal.create<Error, this>(this)

    count() {
        return this.context.count()
    }

    cancel() {
        return this.unsubscribe()
    }

    async unsubscribe() {
        this.end()
        await this.return()
    }
}
