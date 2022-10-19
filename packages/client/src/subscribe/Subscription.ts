/**
 * The client.subscribe() return value.
 * Primary interface for consuming StreamMessages.
 */
import { StreamPartID } from 'streamr-client-protocol'
import { MessageStream, MessageStreamOnMessage } from './MessageStream'
import { SubscriptionSession } from './SubscriptionSession'
import { LoggerFactory } from '../utils/LoggerFactory'
import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'

export { MessageStreamOnMessage as SubscriptionOnMessage }

export interface SubscriptionEvents {
    error: (err: Error) => void
    resendComplete: () => void
}

/**
 * @category Important
 */
export class Subscription<T = unknown> extends MessageStream<T> {
    /** @internal */
    private readonly subSession: SubscriptionSession<T>
    /** @internal */
    private readonly logger: Logger
    readonly streamPartId: StreamPartID
    protected eventEmitter: EventEmitter<SubscriptionEvents>

    /** @internal */
    constructor(subSession: SubscriptionSession<T>, loggerFactory: LoggerFactory) {
        super()
        this.subSession = subSession
        this.streamPartId = subSession.streamPartId
        this.eventEmitter = new EventEmitter<SubscriptionEvents>()
        this.logger = loggerFactory.createLogger(module)
        this.onMessage.listen((msg) => {
            this.logger.debug('onMessage %j', msg.serializedContent)
        })
        this.onError.listen((err) => {
            this.eventEmitter.emit('error', err)
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

    on<E extends keyof SubscriptionEvents>(eventName: E, listener: SubscriptionEvents[E]): void {
        this.eventEmitter.on(eventName, listener as any)
    }

    once<E extends keyof SubscriptionEvents>(eventName: E, listener: SubscriptionEvents[E]): void {
        this.eventEmitter.once(eventName, listener as any)
    }

    off<E extends keyof SubscriptionEvents>(eventName: E, listener: SubscriptionEvents[E]): void {
        this.eventEmitter.off(eventName, listener as any)
    }
}
