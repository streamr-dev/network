import { StreamPartID } from '@streamr/protocol'
import { MessageStream } from './MessageStream'
import { LoggerFactory } from '../utils/LoggerFactory'
import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'

/**
 * Events emitted by {@link Subscription}.
 */
export interface SubscriptionEvents {
    /**
     * Emitted if an error occurred in the subscription.
     */
    error: (err: Error) => void

    /**
     * Emitted when a resend is complete.
     */
    resendComplete: () => void
}

/**
 * A convenience API for managing an individual subscription.
 *
 * @category Important
 */
export class Subscription extends MessageStream {
    protected readonly logger: Logger
    readonly streamPartId: StreamPartID
    protected eventEmitter: EventEmitter<SubscriptionEvents>
    /** @internal */
    readonly isRaw: boolean

    /** @internal */
    constructor(streamPartId: StreamPartID, isRaw: boolean, loggerFactory: LoggerFactory) {
        super()
        this.streamPartId = streamPartId
        this.isRaw = isRaw
        this.eventEmitter = new EventEmitter<SubscriptionEvents>()
        this.logger = loggerFactory.createLogger(module)
        this.onError.listen((err) => {
            this.eventEmitter.emit('error', err)
            this.logger.debug('Encountered error', { err })
        })
    }

    /**
     * Unsubscribes this subscription.
     *
     * @remarks The instance should not be used after calling this.
     */
    async unsubscribe(): Promise<void> {
        this.end()
        await this.return()
        this.eventEmitter.removeAllListeners()
    }

    /**
     * Adds an event listener to the subscription.
     * @param eventName - event name, see {@link SubscriptionEvents} for options
     * @param listener - the callback function
     */
    on<E extends keyof SubscriptionEvents>(eventName: E, listener: SubscriptionEvents[E]): void {
        this.eventEmitter.on(eventName, listener as any)
    }

    /**
     * Adds an event listener to the subscription that is invoked only once.
     * @param eventName - event name, see {@link SubscriptionEvents} for options
     * @param listener - the callback function
     */
    once<E extends keyof SubscriptionEvents>(eventName: E, listener: SubscriptionEvents[E]): void {
        this.eventEmitter.once(eventName, listener as any)
    }

    /**
     * Removes an event listener from the subscription.
     * @param eventName - event name, see {@link SubscriptionEvents} for options
     * @param listener - the callback function to remove
     */
    off<E extends keyof SubscriptionEvents>(eventName: E, listener: SubscriptionEvents[E]): void {
        this.eventEmitter.off(eventName, listener as any)
    }
}
