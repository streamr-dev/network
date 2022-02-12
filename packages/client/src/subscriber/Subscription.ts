/**
 * The client.subscribe() return value.
 * Primary interface for consuming StreamMessages.
 */
import { StreamPartID } from 'streamr-client-protocol'
import MessageStream, { MessageStreamOptions, MessageStreamOnMessage } from './MessageStream'
import SubscriptionSession from './SubscriptionSession'

export { MessageStreamOnMessage as SubscriptionOnMessage }

export default class Subscription<T = unknown> extends MessageStream<T> {
    context: SubscriptionSession<T>
    public readonly streamPartId: StreamPartID
    /** prevent buffered data from yielding */
    isUnsubscribed = false

    constructor(subSession: SubscriptionSession<T>, options?: MessageStreamOptions) {
        super(subSession, options)
        this.context = subSession
        this.streamPartId = subSession.streamPartId
        this.onMessage((msg) => {
            this.debug('<< %o', msg)
        })
        // this.debug('create', this.key, new Error('Subscription').stack)
    }

    count() {
        return this.context.count()
    }

    waitForNeighbours(numNeighbours?: number, timeout?: number) {
        return this.context.waitForNeighbours(numNeighbours, timeout)
    }

    cancel() {
        return this.unsubscribe()
    }

    async unsubscribe() {
        this.end()
        await this.return()
    }
}
