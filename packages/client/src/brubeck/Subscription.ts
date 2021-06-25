import MessageStream, { MessageStreamOptions } from './MessageStream'
import SubscriptionSession from './SubscriptionSession'

export default class Subscription extends MessageStream {
    context: SubscriptionSession

    constructor(subSession: SubscriptionSession, opts: MessageStreamOptions) {
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
