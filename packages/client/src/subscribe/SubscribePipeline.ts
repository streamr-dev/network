/**
 * Subscription message processing pipeline
 */

import { StreamMessage, StreamMessageError, GroupKeyErrorResponse, StreamPartID } from 'streamr-client-protocol'

import OrderMessages from './OrderMessages'
import { MessageStream } from './MessageStream'

import Validator from '../Validator'
import { Decrypt } from './Decrypt'
import { SubscriberKeyExchange } from '../encryption/KeyExchangeSubscriber'
import { Context } from '../utils/Context'
import { Config } from '../Config'
import Resends from './Resends'
import { DestroySignal } from '../DestroySignal'
import { DependencyContainer } from 'tsyringe'
import { StreamEndpointsCached } from '../StreamEndpointsCached'

export default function SubscribePipeline<T = unknown>(
    messageStream: MessageStream<T>,
    streamPartId: StreamPartID,
    context: Context,
    container: DependencyContainer
): MessageStream<T> {
    const validate = new Validator(
        context,
        container.resolve(StreamEndpointsCached),
        container.resolve(Config.Subscribe),
        container.resolve(Config.Cache)
    )

    const gapFillMessages = new OrderMessages<T>(
        container.resolve(Config.Subscribe),
        container.resolve(Context as any),
        container.resolve(Resends),
        streamPartId,
    )

    const orderMessages = new OrderMessages<T>(
        {
            ...container.resolve(Config.Subscribe),
            gapFill: false,
        },
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

        // throw error
    }

    const decrypt = new Decrypt<T>(
        context,
        container.resolve(StreamEndpointsCached),
        container.resolve(SubscriberKeyExchange),
        container.resolve(DestroySignal),
    )

    // collect messages that fail validation/parsing, do not push out of pipeline
    // NOTE: we let failed messages be processed and only removed at end so they don't
    // end up acting as gaps that we repeatedly try to fill.
    const ignoreMessages = new WeakSet()
    return messageStream
        .onError(onError)
        // order messages (fill gaps)
        .pipe(gapFillMessages.transform())
        // convert group key error responses into errors
        // (only for subscribe pipeline, not publish pipeline)
        .forEach((streamMessage) => {
            if (streamMessage.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE) {
                const errMsg = streamMessage as StreamMessage<any>
                const res = GroupKeyErrorResponse.fromArray(errMsg.getParsedContent())
                const err = new StreamMessageError(`GroupKeyErrorResponse: ${res.errorMessage}`, streamMessage, res.errorCode)
                throw err
            }
        })
        // validate
        .forEach(async (streamMessage) => {
            await validate.validate(streamMessage).catch(onError)
        })
        // decrypt
        .forEach(decrypt.decrypt)
        // parse content
        .forEach(async (streamMessage) => {
            streamMessage.getParsedContent()
        })
        // re-order messages (ignore gaps)
        .pipe(orderMessages.transform())
        // ignore any failed messages
        .filter(async (streamMessage) => {
            return !ignoreMessages.has(streamMessage)
        })
        .onBeforeFinally(async () => {
            const tasks = [
                orderMessages.stop(),
                gapFillMessages.stop(),
                decrypt.stop(),
                validate.stop(),
            ]
            await Promise.allSettled(tasks)
        })
}
