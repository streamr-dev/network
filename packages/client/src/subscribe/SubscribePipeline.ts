/**
 * Subscription message processing pipeline
 */
import {
    StreamMessage,
    StreamMessageError,
    StreamPartID
} from 'streamr-client-protocol'
import { OrderMessages } from './OrderMessages'
import { MessageStream } from './MessageStream'
import { Validator } from '../Validator'
import { Decrypt } from './Decrypt'
import { Context } from '../utils/Context'
import { ConfigInjectionToken } from '../Config'
import { Resends } from './Resends'
import { DestroySignal } from '../DestroySignal'
import { DependencyContainer } from 'tsyringe'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { MsgChainUtil } from './MsgChainUtil'
import { GroupKeyStoreFactory } from '../encryption/GroupKeyStoreFactory'
import { SubscriberKeyExchange } from '../encryption/SubscriberKeyExchange'
import { StreamrClientEventEmitter } from '../events'

export function SubscribePipeline<T = unknown>(
    messageStream: MessageStream<T>,
    streamPartId: StreamPartID,
    context: Context,
    container: DependencyContainer
): MessageStream<T> {
    const validate = new Validator(
        context,
        container.resolve(StreamRegistryCached),
        container.resolve(ConfigInjectionToken.Subscribe),
        container.resolve(ConfigInjectionToken.Cache)
    )

    const gapFillMessages = new OrderMessages<T>(
        container.resolve(ConfigInjectionToken.Subscribe),
        container.resolve(Context as any),
        container.resolve(Resends),
        streamPartId,
    )

    /* eslint-enable object-curly-newline */

    const onError = async (error: Error | StreamMessageError, streamMessage?: StreamMessage) => {
        if (streamMessage) {
            ignoreMessages.add(streamMessage)
        }

        if (error && 'streamMessage' in error && error.streamMessage) {
            ignoreMessages.add(error.streamMessage)
        }

        throw error
    }

    const decrypt = new Decrypt<T>(
        context,
        container.resolve(GroupKeyStoreFactory),
        container.resolve(SubscriberKeyExchange),
        container.resolve(StreamRegistryCached),
        container.resolve(DestroySignal),
        container.resolve(StreamrClientEventEmitter),
        container.resolve(ConfigInjectionToken.Timeouts),
    )

    const msgChainUtil = new MsgChainUtil<T>((msg) => decrypt.decrypt(msg), messageStream.onError)

    // collect messages that fail validation/parsixng, do not push out of pipeline
    // NOTE: we let failed messages be processed and only removed at end so they don't
    // end up acting as gaps that we repeatedly try to fill.
    const ignoreMessages = new WeakSet()
    messageStream.onError.listen(onError)
    messageStream
        // order messages (fill gaps)
        .pipe(gapFillMessages.transform())
        // validate
        .forEach(async (streamMessage: StreamMessage) => {
            await validate.validate(streamMessage)
        })
        // decrypt
        .pipe(async function* (src: AsyncGenerator<StreamMessage<T>>) {
            setImmediate(async () => {
                for await (const msg of src) {
                    msgChainUtil.addMessage(msg)
                }
                await msgChainUtil.flush()
                msgChainUtil.stop()
            })
            yield* msgChainUtil
        })
        // parse content
        .forEach(async (streamMessage: StreamMessage) => {
            streamMessage.getParsedContent()
        })
        // ignore any failed messages
        .filter(async (streamMessage: StreamMessage) => {
            return !ignoreMessages.has(streamMessage)
        })
        .onBeforeFinally.listen(async () => {
            const tasks = [
                gapFillMessages.stop(),
                decrypt.stop(),
                validate.stop(),
            ]
            await Promise.allSettled(tasks)
        })
    return messageStream
}
