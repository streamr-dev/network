import MessageStream, { MessageStreamOptions } from './MessageStream'
import SubscriptionSession from './SubscriptionSession'

export default class Subscription<T> extends MessageStream<T> {
    context: SubscriptionSession<T>

    constructor(subSession: SubscriptionSession<T>, opts: MessageStreamOptions) {
        super(subSession, opts)
        this.context = subSession
    }

    count() {
        return this.context.count()
    }

    unsubscribe() {
        return this.end()
    }
}
