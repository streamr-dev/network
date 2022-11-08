/**
 * Subscription message processing pipeline
 */
import {
    StreamMessage,
    StreamMessageError,
    StreamPartID
} from '@streamr/protocol'
import { OrderMessages } from './OrderMessages'
import { MessageStream } from './MessageStream'
import { Validator } from '../Validator'
import { Decrypt } from './Decrypt'
import { StrictStreamrClientConfig } from '../Config'
import { Resends } from './Resends'
import { DestroySignal } from '../DestroySignal'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { MsgChainUtil } from './MsgChainUtil'
import { GroupKeyStore } from '../encryption/GroupKeyStore'
import { SubscriberKeyExchange } from '../encryption/SubscriberKeyExchange'
import { StreamrClientEventEmitter } from '../events'
import { LoggerFactory } from '../utils/LoggerFactory'

export interface SubscriptionPipelineOptions {
    streamPartId: StreamPartID
    loggerFactory: LoggerFactory
    resends: Resends
    groupKeyStore: GroupKeyStore
    subscriberKeyExchange: SubscriberKeyExchange
    streamRegistryCached: StreamRegistryCached
    streamrClientEventEmitter: StreamrClientEventEmitter
    destroySignal: DestroySignal
    config: StrictStreamrClientConfig
}

export const createSubscribePipeline = <T = unknown>(opts: SubscriptionPipelineOptions): MessageStream<T> => {
    const validate = new Validator(
        opts.streamRegistryCached
    )

    const gapFillMessages = new OrderMessages<T>(
        opts.config,
        opts.resends,
        opts.streamPartId,
        opts.loggerFactory
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
        opts.groupKeyStore,
        opts.subscriberKeyExchange,
        opts.streamRegistryCached,
        opts.destroySignal,
        opts.loggerFactory,
        opts.streamrClientEventEmitter,
        opts.config,
    )

    const messageStream = new MessageStream<T>()
    const msgChainUtil = new MsgChainUtil<T>(async (msg) => {
        await validate.validate(msg)
        return decrypt.decrypt(msg)
    }, messageStream.onError)

    // collect messages that fail validation/parsixng, do not push out of pipeline
    // NOTE: we let failed messages be processed and only removed at end so they don't
    // end up acting as gaps that we repeatedly try to fill.
    const ignoreMessages = new WeakSet()
    messageStream.onError.listen(onError)
    messageStream
        // order messages (fill gaps)
        .pipe(gapFillMessages.transform())
        // validate & decrypt
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
                validate.stop(),
            ]
            await Promise.allSettled(tasks)
        })
    return messageStream
}
