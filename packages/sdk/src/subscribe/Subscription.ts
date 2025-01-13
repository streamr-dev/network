import { EthereumAddress, Logger, StreamPartID } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { LoggerFactory } from '../utils/LoggerFactory'
import { MessageStream } from './MessageStream'

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
    resendCompleted: () => void
}

/**
 * A convenience API for managing an individual subscription.
 *
 * @category Important
 */
export class Subscription extends MessageStream {
    readonly streamPartId: StreamPartID
    /** @internal */
    readonly isRaw: boolean
    readonly erc1271ContractAddress: EthereumAddress | undefined
    private readonly eventEmitter: EventEmitter<SubscriptionEvents>
    private readonly logger: Logger

    /** @internal */
    constructor(
        streamPartId: StreamPartID,
        isRaw: boolean,
        erc1271ContractAddress: EthereumAddress | undefined,
        eventEmitter: EventEmitter<SubscriptionEvents>,
        loggerFactory: LoggerFactory
    ) {
        super()
        this.streamPartId = streamPartId
        this.isRaw = isRaw
        this.erc1271ContractAddress = erc1271ContractAddress
        this.eventEmitter = eventEmitter
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
