/**
 * The client.subscribe() return value.
 * Primary interface for consuming StreamMessages.
 */
import { StreamPartID } from 'streamr-client-protocol'
import { MessageStream, MessageStreamOptions, MessageStreamOnMessage } from './MessageStream'
import SubscriptionSession from './SubscriptionSession'

export { MessageStreamOnMessage as SubscriptionOnMessage }

export class Subscription<T = unknown> extends MessageStream<T> {
    // @internal
    context: SubscriptionSession<T>
    // TODO should we mark this internal and add a method to get the stream+partition of a subcription? (streamPartId is an internal data format)
    readonly streamPartId: StreamPartID
    /** prevent buffered data from yielding */
    // @internal
    isUnsubscribed = false

    // @internal
    constructor(subSession: SubscriptionSession<T>, options?: MessageStreamOptions) {
        super(subSession, options)
        this.context = subSession
        this.streamPartId = subSession.streamPartId
        this.onMessage((msg) => {
            this.debug('<< %o', msg)
        })
        // this.debug('create', this.key, new Error('Subscription').stack)
    }

    // @internal
    waitForNeighbours(numNeighbours?: number, timeout?: number) {
        return this.context.waitForNeighbours(numNeighbours, timeout)
    }

    async unsubscribe() {
        this.end()
        await this.return()
    }
}
