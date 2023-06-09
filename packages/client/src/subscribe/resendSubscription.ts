import { StreamMessage } from '@streamr/protocol'
import EventEmitter from 'eventemitter3'
import { StrictStreamrClientConfig } from '../Config'
import { LoggerFactory } from '../utils/LoggerFactory'
import { OrderMessages } from './OrderMessages'
import { ResendOptions, Resends } from './Resends'
import { Subscription, SubscriptionEvents } from './Subscription'

/*
 * Initialize subscription pipeline transformations for a resend subscription
 */
export const initResendSubscription = (
    subscription: Subscription,
    resendOptions: ResendOptions,
    resends: Resends,
    config: StrictStreamrClientConfig,
    eventEmitter: EventEmitter<SubscriptionEvents>,
    loggerFactory: LoggerFactory
): void => {
    const resendThenRealtime = async function* (src: AsyncGenerator<StreamMessage>): AsyncGenerator<StreamMessage, void, any> {
        try {
            const resentMsgs = await resends.resend(subscription.streamPartId, resendOptions)
            subscription.onBeforeFinally.listen(async () => {
                resentMsgs.end()
                await resentMsgs.return()
            })
            yield* resentMsgs.getStreamMessages()
        } catch (err) {
            if (err.code === 'NO_STORAGE_NODES') {
                loggerFactory.createLogger(module).warn('Skip resend (no storage assigned to stream)', {
                    streamPartId: subscription.streamPartId,
                    resendOptions
                })
            } else {
                await subscription.handleError(err)
            }
        }
        eventEmitter.emit('resendComplete')
        yield* src
    }
    subscription.pipe(resendThenRealtime)
    if (config.orderMessages) {
        const orderMessages = new OrderMessages(
            config,
            resends,
            subscription.streamPartId,
            loggerFactory
        )
        subscription.pipe(orderMessages.transform())
        subscription.onBeforeFinally.listen(() => orderMessages.stop())
    }
}
