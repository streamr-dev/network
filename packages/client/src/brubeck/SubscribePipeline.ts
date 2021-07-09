import { StreamMessage } from 'streamr-client-protocol'

import { counterId } from '../utils'
import { Pipeline } from '../utils/Pipeline'
import { Context } from '../utils/Context'
import { validateOptions } from '../stream/utils'

import Validator from '../subscribe/Validator'
import MessageStream from './MessageStream'
import OrderMessages from './OrderMessages'
import Decrypt from '../subscribe/Decrypt'
import StreamrClient from '..'

export { SignatureRequiredError } from '../subscribe/Validator'

/**
 * Subscription message processing pipeline
 */

export default function MessagePipeline<T>(
    context: Context,
    client: StreamrClient,
    source: AsyncGenerator<StreamMessage<T>>,
    opts: any = {},
): MessageStream<T> {
    const options: any = validateOptions(opts)
    const { key } = options as any
    // const id = counterId('MessagePipeline') + key

    /* eslint-disable object-curly-newline */
    const {
        validate = Validator(client, options),
        // orderingUtil = OrderMessages(client, options),
        decrypt = Decrypt(client, options),
    } = options as any
    /* eslint-enable object-curly-newline */

    const seenErrors = new WeakSet()
    const onErrorFn = options.onError ? options.onError : (error: Error) => { throw error }
    const onError = async (err: Error) => {
        // don't handle same error multiple times
        if (seenErrors.has(err)) {
            return
        }
        seenErrors.add(err)
        await onErrorFn(err)
    }

    // re-order messages (ignore gaps)
    // const internalOrderingUtil = OrderMessages(client, {
    // ...options,
    // gapFill: false,
    // })

    // collect messages that fail validation/parsing, do not push out of pipeline
    // NOTE: we let failed messages be processed and only removed at end so they don't
    // end up acting as gaps that we repeatedly try to fill.
    const ignoreMessages = new WeakSet()

    const pipeline = new Pipeline(source)
        // take messages
        .pipe(async function* PrintMessages(src) {
            for await (const streamMessage of src) {
                yield streamMessage
            }
        })
        // order messages (fill gaps)
        // .pipe(async function* ValidateMessages(src: AsyncIterable<StreamMessage>) {
    // orderingUtil
        // })
        // validate
        .pipe(async function* ValidateMessages(src) {
            for await (const streamMessage of src) {
                try {
                    await validate(streamMessage)
                } catch (err) {
                    ignoreMessages.add(streamMessage)
                    await onError(err)
                }
                yield streamMessage
            }
        })
        // decrypt
        .pipe(async function* DecryptMessages(src) {
            yield* decrypt(src, async (err: Error, streamMessage: StreamMessage) => {
                ignoreMessages.add(streamMessage)
                await onError(err)
            })
        })
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
        // internalOrderingUtil,
        // ignore any failed messages
        .pipe(async function* IgnoreMessages(src) {
            for await (const streamMessage of src) {
                if (ignoreMessages.has(streamMessage)) {
                    continue
                }
                yield streamMessage
            }
        })

    const messageStream = new MessageStream<T>(context)
    messageStream.from(pipeline)
    return messageStream
    // .finally(async (err) => {
    // // decrypt.stop()
    // // await source.cancel(err)
    // try {
    // // if (err) {
    // // await onError(err)
    // // }
    // } finally {
    // await onFinally(err)
    // }
    // }

    // return Object.assign(p, {
    // id,
    // })
}
