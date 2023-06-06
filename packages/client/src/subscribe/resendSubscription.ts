import { StreamMessage } from '@streamr/protocol'
import { LoggerFactory } from '../utils/LoggerFactory'
import { StrictStreamrClientConfig } from '../Config'
import { OrderMessages } from './OrderMessages'
import { ResendOptions, Resends } from './Resends'
import { Subscription } from './Subscription'

/*
 * Initialize subscription pipeline transformations for a resend subscription
 */
export const initResendSubscription = (
    subscription: Subscription,
    resendOptions: ResendOptions,
    resends: Resends,
    config: StrictStreamrClientConfig,
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
                // @ts-expect-error private TODO should we expose logger somehow or use a separate logger?
                subscription.logger.warn('Skip resend (no storage assigned to stream)', {
                    streamPartId: subscription.streamPartId,
                    resendOptions
                })
            } else {
                await subscription.handleError(err)
            }
        }
        // @ts-expect-error private TODO should we expose eventEmitter somehow?
        subscription.eventEmitter.emit('resendComplete')
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
