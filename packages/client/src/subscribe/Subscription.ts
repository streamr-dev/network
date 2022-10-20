/**
 * The client.subscribe() return value.
 * Primary interface for consuming StreamMessages.
 */
import { StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { LoggerFactory } from '../utils/LoggerFactory'
import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { PushPipeline } from '../utils/PushPipeline'

export type MessageListener<T, R = unknown> = (content: T, streamMessage: StreamMessage<T>) => R | Promise<R>

export interface SubscriptionEvents {
    error: (err: Error) => void
    resendComplete: () => void
}

/**
 * @category Important
 */
export class Subscription<T = unknown> extends PushPipeline<StreamMessage<T>, StreamMessage<T>> {
    private readonly logger: Logger
    readonly streamPartId: StreamPartID
    protected eventEmitter: EventEmitter<SubscriptionEvents>

    /** @internal */
    constructor(streamPartId: StreamPartID, loggerFactory: LoggerFactory) {
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
    }

    async unsubscribe(): Promise<void> {
        this.end()
        await this.return()
    }

    /**
     * Attach a legacy onMessage handler and consume if necessary.
     * onMessage is passed parsed content as first arument, and streamMessage as second argument.
     * @internal
     */
    useLegacyOnMessageHandler(onMessage?: MessageListener<T>): this {
        if (onMessage) {
            this.onMessage.listen(async (streamMessage) => {
                if (streamMessage instanceof StreamMessage) {
                    await onMessage(streamMessage.getParsedContent(), streamMessage)
                }
            })
        }
        this.flow()
        return this
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
