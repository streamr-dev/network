/**
 * The client.subscribe() return value.
 * Primary interface for consuming StreamMessages.
 */
import { SPID, SPIDKeyShape, StreamID } from 'streamr-client-protocol'
import MessageStream, { MessageStreamOptions, MessageStreamOnMessage } from './MessageStream'
import SubscriptionSession from './SubscriptionSession'

export type SubscriptionOptions = {
  streamId: StreamID,
  streamPartition: number
}

export { MessageStreamOnMessage as SubscriptionOnMessage }

export default class Subscription<T = unknown> extends MessageStream<T> implements SPIDKeyShape {
    context: SubscriptionSession<T>
    spid: SPID
    /** prevent buffered data from yielding */
    isUnsubscribed = false
    streamId: StreamID
    streamPartition
    key

    constructor(subSession: SubscriptionSession<T>, options?: MessageStreamOptions) {
        super(subSession, options)
        this.context = subSession
        this.spid = subSession.spid
        this.streamId = this.spid.streamId
        this.streamPartition = this.spid.streamPartition
        this.key = this.spid.key
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
