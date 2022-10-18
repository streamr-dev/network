/**
 * The client.subscribe() return value.
 * Primary interface for consuming StreamMessages.
 */
import { StreamPartID } from 'streamr-client-protocol'
import { MessageStream, MessageStreamOnMessage } from './MessageStream'
import { SubscriptionSession } from './SubscriptionSession'
import { LoggerFactory } from '../utils/LoggerFactory'
import { Logger } from '@streamr/utils'

export { MessageStreamOnMessage as SubscriptionOnMessage }

/**
 * @category Important
 */
export class Subscription<T = unknown> extends MessageStream<T> {
    /** @internal */
    private readonly subSession: SubscriptionSession<T>
    /** @internal */
    private readonly logger: Logger
    readonly streamPartId: StreamPartID

    /** @internal */
    constructor(subSession: SubscriptionSession<T>, loggerFactory: LoggerFactory) {
        super()
        this.subSession = subSession
        this.streamPartId = subSession.streamPartId
        this.logger = loggerFactory.createLogger(module)
        this.onMessage.listen((msg) => {
            this.logger.debug('onMessage %j', msg.serializedContent)
        })
        this.onError.listen((err) => {
            this.logger.debug('onError %s', err)
        })
    }

    async unsubscribe(): Promise<void> {
        this.end()
        await this.return()
    }

    /** @internal */
    waitForNeighbours(numNeighbours?: number, timeout?: number): Promise<boolean> {
        return this.subSession.waitForNeighbours(numNeighbours, timeout)
    }

    on(_eventName: 'error', cb: (err: Error) => void): void {
        this.onError.listen(cb)
    }
}
