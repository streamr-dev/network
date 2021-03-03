import { counterId } from '../utils'
import { pipeline } from '../utils/iterators'
import { validateOptions } from '../stream/utils'

import Validator from './Validator'
import messageStream from './messageStream'
import OrderMessages from './OrderMessages'
import Decrypt from './Decrypt'

export { SignatureRequiredError } from './Validator'

async function collect(src) {
    const msgs = []
    for await (const msg of src) {
        msgs.push(msg.getParsedContent())
    }

    return msgs
}

/**
 * Subscription message processing pipeline
 */

export default function MessagePipeline(client, opts = {}, onFinally = async () => {}) {
    const options = validateOptions(opts)
    const { key, afterSteps = [], beforeSteps = [] } = options
    const seenErrors = new WeakSet()
    const onErrorFn = options.onError ? options.onError : (error) => { throw error }
    const onError = async (id, err) => {
        // throw err
        // await onErrorFn(err).catch(() => {})
        // return
        // throw err
        // try {
        if (seenErrors.has(err)) {
            return
            // throw err
        }
        console.log('onError', client.id, id, err.message.slice(0, 180))
        console.log(onErrorFn.toString())
        seenErrors.add(err)
            await onErrorFn(err)
        // } catch (errr) {
            // console.log('onErrorFn throws', errr)
        // }
    }

    const id = counterId('MessagePipeline') + key

    /* eslint-disable object-curly-newline */
    const {
        validate = Validator(client, options),
        msgStream = messageStream(client.connection, options),
        orderingUtil = OrderMessages(client, options),
        decrypt = Decrypt(client, options),
    } = options
    /* eslint-enable object-curly-newline */

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
        msgStream,
        // custom pipeline steps
        ...beforeSteps,
        // unpack stream message
        async function* getStreamMessage(src) {
            for await (const { streamMessage } of src) {
                yield streamMessage
            }
        },
        // order messages (fill gaps)
        orderingUtil,
        // validate
        async function* ValidateMessages(src) {
            for await (const streamMessage of src) {
                try {
                    client.debug('validate >', streamMessage)
                    await validate(streamMessage)
                } catch (err) {
                    ignoreMessages.add(streamMessage)
                    await onError('validate', err)
                }
                yield streamMessage
            }
        },
        // decrypt
        async function* DecryptMessages(src) {
            try {
                yield* decrypt(src, async (err, streamMessage) => {
                    ignoreMessages.add(streamMessage)
                    await onError('decrypt', err)
                })
            } catch (err) {
                await onError('validate', err)
            }
        },
        // parse content
        async function* ParseMessages(src) {
            for await (const streamMessage of src) {
                try {
                    streamMessage.getParsedContent()
                } catch (err) {
                    ignoreMessages.add(streamMessage)
                    await onError('parse', err)
                }
                yield streamMessage
            }
        },
        // re-order messages (ignore gaps)
        internalOrderingUtil,
        // ignore any failed messages
        async function* IgnoreMessages(src) {
            for await (const streamMessage of src) {
                if (ignoreMessages.has(streamMessage)) {
                    continue
                }
                yield streamMessage
            }
        },
        // special handling for bye message
        async function* ByeMessageSpecialHandling(src) {
            for await (const orderedMessage of src) {
                yield orderedMessage
                try {
                    if (orderedMessage.isByeMessage()) {
                        break
                    }
                } catch (err) {
                    await onError('isBye', err)
                }
            }
        },
        // custom pipeline steps
        ...afterSteps
    ], async (err, ...args) => {
        console.log('pipeline ended with ', err && err.message)
        await msgStream.cancel(err)
        try {
            if (err) {
                await onError('in finally', err)
            }
        } finally {
            await onFinally(err, ...args)
        }
    })

    return Object.assign(p, {
        id,
        msgStream,
        orderingUtil,
        validate,
        collect: collect.bind(null, p),
        end: msgStream.end,
    })
}
