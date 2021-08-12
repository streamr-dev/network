import { MessageContent, SPID } from 'streamr-client-protocol'

import OrderMessages from './OrderMessages'
import MessageStream from './MessageStream'

import Validator from './Validator'
import { Decrypt, DecryptWithExchangeOptions } from './Decrypt'
import { SubscriberKeyExchange } from './encryption/KeyExchangeSubscriber'
import { Context } from './utils/Context'
import { Config } from './Config'
import Resends from './Resends'
import { DependencyContainer } from 'tsyringe'
import { StreamEndpointsCached } from './StreamEndpointsCached'

/**
 * Subscription message processing pipeline
 */

export default function SubscribePipeline<T extends MessageContent | unknown>(
    spid: SPID,
    options: DecryptWithExchangeOptions<T>,
    context: Context,
    container: DependencyContainer
): MessageStream<T> {
    const validate = new Validator(
        container.resolve(StreamEndpointsCached),
        container.resolve(Config.Subscribe)
    )
    const orderMessages = new OrderMessages<T>(container.resolve(Config.Subscribe), container.resolve(Context as any), container.resolve(Resends))
    // const subscribeOptions = container.resolve<SubscribeConfig>(Config.Subscribe)
    // const { key } = options as any
    // const id = counterId('MessagePipeline') + key

    /* eslint-enable object-curly-newline */

    const seenErrors = new WeakSet()
    const onErrorFn = (error: Error) => {
        if (options.onError) {
            return options.onError(error)
        }
        throw error
    }

    const onError = async (err: Error) => {
        // don't handle same error multiple times
        if (seenErrors.has(err)) {
            return
        }
        seenErrors.add(err)
        await onErrorFn(err)
    }

    const decrypt = new Decrypt<T>(
        context,
        container.resolve(StreamEndpointsCached),
        container.resolve(SubscriberKeyExchange),
        {
            ...options,
            onError: async (err, streamMessage) => {
                if (streamMessage) {
                    ignoreMessages.add(streamMessage)
                }
                await onError(err)
            },
        }
    )

    // collect messages that fail validation/parsing, do not push out of pipeline
    // NOTE: we let failed messages be processed and only removed at end so they don't
    // end up acting as gaps that we repeatedly try to fill.
    const ignoreMessages = new WeakSet()

    return new MessageStream<T>(context)
        // take messages
        .pipe(async function* PrintMessages(src) {
            for await (const streamMessage of src) {
                yield streamMessage
            }
        })
        // order messages (fill gaps)
        .pipe(orderMessages.transform(spid))
        // validate
        .pipe(async function* ValidateMessages(src) {
            for await (const streamMessage of src) {
                try {
                    await validate.validate(streamMessage)
                } catch (err) {
                    ignoreMessages.add(streamMessage)
                    await onError(err)
                }
                yield streamMessage
            }
        })
        // decrypt
        .pipe(decrypt.decrypt)
        // parse content
        .pipe(async function* ParseMessages(src) {
            for await (const streamMessage of src) {
                try {
                    streamMessage.getParsedContent()
                } catch (err) {
                    ignoreMessages.add(streamMessage)
                    await onError(err)
                }
                yield streamMessage
            }
        })
        // re-order messages (ignore gaps)
        .pipe(orderMessages.transform(spid, { gapFill: false }))
        // ignore any failed messages
        .pipe(async function* IgnoreMessages(src) {
            for await (const streamMessage of src) {
                if (ignoreMessages.has(streamMessage)) {
                    continue
                }
                yield streamMessage
            }
        })
        .onBeforeFinally(async () => {
            const tasks = [
                decrypt.stop(),
                validate.stop(),
            ]
            await Promise.allSettled(tasks)
        })
}
