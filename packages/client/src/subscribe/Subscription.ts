/**
 * The client.subscribe() return value.
 * Primary interface for consuming StreamMessages.
 */
import { StreamPartID } from 'streamr-client-protocol'
import { MessageStream, MessageStreamOptions, MessageStreamOnMessage } from './MessageStream'
import SubscriptionSession from './SubscriptionSession'

export { MessageStreamOnMessage as SubscriptionOnMessage }

/**
 * @category Important
 */
export class Subscription<T = unknown> extends MessageStream<T> {
    /** @internal */
    context: SubscriptionSession<T>
    readonly streamPartId: StreamPartID
    /**
     * prevent buffered data from yielding
     * @internal */
    isUnsubscribed = false

    /** @internal */
    constructor(subSession: SubscriptionSession<T>, options?: MessageStreamOptions) {
        super(subSession, options)
        this.context = subSession
        this.streamPartId = subSession.streamPartId
        this.onMessage((msg) => {
            this.debug('<< %o', msg)
        })
        // this.debug('create', this.key, new Error('Subscription').stack)
    }

    /** @internal */
    waitForNeighbours(numNeighbours?: number, timeout?: number) {
        return this.context.waitForNeighbours(numNeighbours, timeout)
    }

    async unsubscribe() {
        this.end()
        await this.return()
    }
}
