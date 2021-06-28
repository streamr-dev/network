import { StreamMessage } from 'streamr-client-protocol'

import { counterId } from '../utils'
import { pipeline } from '../utils/iterators'
import { validateOptions } from '../stream/utils'

import Validator from '../subscribe/Validator'
import MessageStream from './MessageStream'
import OrderMessages from '../subscribe/OrderMessages'
import Decrypt from '../subscribe/Decrypt'
import StreamrClient from '..'

export { SignatureRequiredError } from '../subscribe/Validator'

/**
 * Subscription message processing pipeline
 */

export default function MessagePipeline<T>(
    client: StreamrClient,
    source: MessageStream<T>,
    opts: any = {},
    onFinally = async (err?: Error) => { if (err) { throw err } }
) {
    const options: any = validateOptions(opts)
    const { key, afterSteps = [], beforeSteps = [] } = options as any
    const id = counterId('MessagePipeline') + key

    /* eslint-disable object-curly-newline */
    const {
        validate = Validator(client, options),
        orderingUtil = OrderMessages(client, options),
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
    const internalOrderingUtil = OrderMessages(client, {
        ...options,
        gapFill: false,
    })

    // collect messages that fail validation/parsing, do not push out of pipeline
    // NOTE: we let failed messages be processed and only removed at end so they don't
    // end up acting as gaps that we repeatedly try to fill.
    const ignoreMessages = new WeakSet()

    const p = pipeline([
        // take messages
        source,
        async function* PrintMessages(src: AsyncIterable<StreamMessage>) {
            for await (const streamMessage of src) {
                yield streamMessage
            }
        },
        // custom pipeline steps
        ...beforeSteps,
        // order messages (fill gaps)
        orderingUtil,
        // validate
        async function* ValidateMessages(src: AsyncIterable<StreamMessage>) {
            for await (const streamMessage of src) {
                try {
                    await validate(streamMessage)
                } catch (err) {
                    ignoreMessages.add(streamMessage)
                    await onError(err)
                }
                yield streamMessage
            }
        },
        // decrypt
        async function* DecryptMessages(src: AsyncIterable<StreamMessage>) {
            yield* decrypt(src, async (err: Error, streamMessage: StreamMessage) => {
                ignoreMessages.add(streamMessage)
                await onError(err)
            })
        },
        // parse content
        async function* ParseMessages(src: AsyncIterable<StreamMessage>) {
            for await (const streamMessage of src) {
                try {
                    streamMessage.getParsedContent()
                } catch (err) {
                    ignoreMessages.add(streamMessage)
                    await onError(err)
                }
                yield streamMessage
            }
        },
        // re-order messages (ignore gaps)
        internalOrderingUtil,
        // ignore any failed messages
        async function* IgnoreMessages(src: AsyncIterable<StreamMessage>) {
            for await (const streamMessage of src) {
                if (ignoreMessages.has(streamMessage)) {
                    continue
                }
                yield streamMessage
            }
        },
        // custom pipeline steps
        ...afterSteps
    ], async (err, ...args) => {
        decrypt.stop()
        await source.cancel(err)
        try {
            if (err) {
                await onError(err)
            }
        } finally {
            await onFinally(err, ...args)
        }
    })

    return Object.assign(p, {
        id,
    })
}
