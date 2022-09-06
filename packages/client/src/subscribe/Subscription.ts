/**
 * The client.subscribe() return value.
 * Primary interface for consuming StreamMessages.
 */
import { StreamPartID } from 'streamr-client-protocol'
import { MessageStream, MessageStreamOnMessage } from './MessageStream'
import { SubscriptionSession } from './SubscriptionSession'

export { MessageStreamOnMessage as SubscriptionOnMessage }

/**
 * @category Important
 */
export class Subscription<T = unknown> extends MessageStream<T> {
    /** @internal */
    private context: SubscriptionSession<T>
    readonly streamPartId: StreamPartID

    /** @internal */
    constructor(subSession: SubscriptionSession<T>) {
        super(subSession)
        this.context = subSession
        this.streamPartId = subSession.streamPartId
        this.onMessage.listen((msg) => {
            this.debug('<< %o', msg)
        })
        this.onError.listen((err) => {
            this.debug('<< onError: %o', err)
        })
        // this.debug('create', this.key, new Error('Subscription').stack)
    }

    /** @internal */
    waitForNeighbours(numNeighbours?: number, timeout?: number): Promise<boolean> {
        return this.context.waitForNeighbours(numNeighbours, timeout)
    }

    on(_eventName: 'error', cb: (err: Error) => void): void {
        this.onError.listen(cb)
    }
}
