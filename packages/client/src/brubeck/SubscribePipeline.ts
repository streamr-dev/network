import { MessageContent, SPID } from 'streamr-client-protocol'

import OrderMessages from './OrderMessages'
import MessageStream from './MessageStream'

import Validator from '../subscribe/Validator'
import Decrypt from './Decrypt'
import { BrubeckClient } from './BrubeckClient'

export { SignatureRequiredError } from '../subscribe/Validator'

/**
 * Subscription message processing pipeline
 */

export default function SubscribePipeline<T extends MessageContent | unknown>(
    client: BrubeckClient,
    spid: SPID,
    options: any = {},
): MessageStream<T> {
    // const { key } = options as any
    // const id = counterId('MessagePipeline') + key

    /* eslint-disable object-curly-newline */
    const validate = Validator(client.client, spid)
    const orderingUtil = OrderMessages<T>(client, spid, options)
    const decrypt = Decrypt(client, options)
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
    const internalOrderingUtil = OrderMessages<T>(client, spid, {
        ...options,
        gapFill: false,
    })

    // collect messages that fail validation/parsing, do not push out of pipeline
    // NOTE: we let failed messages be processed and only removed at end so they don't
    // end up acting as gaps that we repeatedly try to fill.
    const ignoreMessages = new WeakSet()

    return new MessageStream<T>(client)
        // take messages
        .pipe(async function* PrintMessages(src) {
            for await (const streamMessage of src) {
                yield streamMessage
            }
        })
        // order messages (fill gaps)
        .pipe(orderingUtil)
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
        .pipe(internalOrderingUtil)
        // ignore any failed messages
        .pipe(async function* IgnoreMessages(src) {
            for await (const streamMessage of src) {
                if (ignoreMessages.has(streamMessage)) {
                    continue
                }
                yield streamMessage
            }
        })
}
