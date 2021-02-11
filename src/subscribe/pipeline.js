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
    const { key, afterSteps = [], beforeSteps = [], onError = (err) => { throw err } } = options
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
        async function* Validate(src) {
            for await (const streamMessage of src) {
                try {
                    await validate(streamMessage)
                } catch (err) {
                    internalOrderingUtil.markMessageExplicitly(streamMessage)
                    await onError(err)
                }
                yield streamMessage
            }
        },
        // decrypt
        decrypt,
        // parse content
        async function* Parse(src) {
            for await (const streamMessage of src) {
                try {
                    streamMessage.getParsedContent()
                } catch (err) {
                    internalOrderingUtil.markMessageExplicitly(streamMessage)
                    await onError(err)
                }
                yield streamMessage
            }
        },
        // re-order messages (ignore gaps)
        internalOrderingUtil,
        // special handling for bye message
        async function* ByeMessageSpecialHandling(src) {
            for await (const orderedMessage of src) {
                yield orderedMessage
                try {
                    if (orderedMessage.isByeMessage()) {
                        break
                    }
                } catch (err) {
                    await onError(err)
                }
            }
        },
        // custom pipeline steps
        ...afterSteps
    ], async (err, ...args) => {
        await msgStream.cancel(err)
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
        msgStream,
        orderingUtil,
        validate,
        collect: collect.bind(null, p),
        end: msgStream.end,
    })
}
