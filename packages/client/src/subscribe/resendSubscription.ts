import { StreamID, StreamMessage } from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
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
    getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>,
    config: StrictStreamrClientConfig,
    eventEmitter: EventEmitter<SubscriptionEvents>,
    loggerFactory: LoggerFactory
): void => {
    const resendThenRealtime = async function* (src: AsyncGenerator<StreamMessage>): AsyncGenerator<StreamMessage, void, any> {
        try {
            const resentMsgs = await resends.resend(subscription.streamPartId, resendOptions, getStorageNodes)
            subscription.onBeforeFinally.listen(async () => {
                // TODO maybe we could add AbortControler parameter to resend() and signal it here?
                resentMsgs.end()
                await resentMsgs.return()
            })
            yield* resentMsgs
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
            subscription.streamPartId,
            getStorageNodes,
            resends,
            config
        )
        subscription.pipe(async function* (src: AsyncGenerator<StreamMessage>) {
            setImmediate(() => {
                orderMessages.addMessages(src)
            })
            yield* orderMessages
        })
        subscription.onBeforeFinally.listen(() => orderMessages.destroy())
    }
}
