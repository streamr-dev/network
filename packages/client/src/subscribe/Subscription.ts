/**
 * The client.subscribe() return value.
 * Primary interface for consuming StreamMessages.
 */
import { StreamPartID } from 'streamr-client-protocol'
import { MessageStream, MessageStreamOnMessage } from './MessageStream'
import { LoggerFactory } from '../utils/LoggerFactory'
import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { DestroySignal } from '../DestroySignal'

export { MessageStreamOnMessage as SubscriptionOnMessage }

export interface SubscriptionEvents {
    error: (err: Error) => void
    resendComplete: () => void
}

/**
 * @category Important
 */
export class Subscription<T = unknown> extends MessageStream<T> {
    private readonly logger: Logger
    readonly streamPartId: StreamPartID
    protected eventEmitter: EventEmitter<SubscriptionEvents>

    /** @internal */
    constructor(streamPartId: StreamPartID, destroySignal: DestroySignal, loggerFactory: LoggerFactory) {
        super()
        this.streamPartId = streamPartId
        this.eventEmitter = new EventEmitter<SubscriptionEvents>()
        this.logger = loggerFactory.createLogger(module)
        this.onMessage.listen((msg) => {
            this.logger.debug('onMessage %j', msg.serializedContent)
        })
        this.onError.listen((err) => {
            this.eventEmitter.emit('error', err)
            this.logger.debug('onError %s', err)
        })
        destroySignal.onDestroy.listen(() => {
            this.eventEmitter.removeAllListeners()
        })
    }

    async unsubscribe(): Promise<void> {
        this.end()
        await this.return()
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
