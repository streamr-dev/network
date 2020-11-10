import { inspect } from 'util'

import { ControlLayer, MessageLayer, Utils, Errors } from 'streamr-client-protocol'

import { CacheAsyncFn, pOrderedResolve, uuid } from '../utils'
import { pipeline } from '../utils/iterators'
import PushQueue from '../utils/PushQueue'

import { validateOptions, waitForResponse, resend } from './api'

const { OrderingUtil, StreamMessageValidator } = Utils
const { ValidationError } = Errors
const { ControlMessage } = ControlLayer
const { StreamMessage } = MessageLayer

const EMPTY_MESSAGE = {
    serialize() {}
}

export class SignatureRequiredError extends Errors.ValidationError {
    constructor(streamMessage = EMPTY_MESSAGE) {
        super(`Client requires data to be signed. Message: ${inspect(streamMessage)}`)
        this.streamMessage = streamMessage
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

async function collect(src) {
    const msgs = []
    for await (const msg of src) {
        msgs.push(msg.getParsedContent())
    }

    return msgs
}

function getIsMatchingStreamMessage({ streamId, streamPartition = 0 }) {
    return function isMatchingStreamMessage({ streamMessage }) {
        const msgStreamId = streamMessage.getStreamId()
        if (streamId !== msgStreamId) { return false }
        const msgPartition = streamMessage.getStreamPartition()
        if (streamPartition !== msgPartition) { return false }
        return true
    }
}

/**
 * Listen for matching stream messages on connection.
 * Write messages into a Stream.
 */

function messageStream(connection, { streamId, streamPartition, type = ControlMessage.TYPES.BroadcastMessage }) {
    const isMatchingStreamMessage = getIsMatchingStreamMessage({
        streamId,
        streamPartition
    })

    let msgStream
    // write matching messages to stream
    const onMessage = (msg) => {
        if (!isMatchingStreamMessage(msg)) { return }
        msgStream.push(msg)
    }

    // stream acts as buffer
    msgStream = new PushQueue([], {
        onEnd() {
            // remove onMessage handler & clean up
            connection.off(type, onMessage)
        }
    })

    Object.assign(msgStream, {
        streamId,
        streamPartition,
    })

    connection.on(type, onMessage)

    return msgStream
}

function OrderMessages(client, options = {}) {
    const { gapFillTimeout, retryResendAfter } = client.options
    const { streamId, streamPartition } = validateOptions(options)

    const outStream = new PushQueue()

    let done = false

    const orderingUtil = new OrderingUtil(streamId, streamPartition, (orderedMessage) => {
        if (!outStream.isWritable() || done) {
            return
        }

        if (orderedMessage.isByeMessage()) {
            outStream.end(orderedMessage)
        } else {
            outStream.push(orderedMessage)
        }
    }, (from, to, publisherId, msgChainId) => async () => {
        if (done) { return }
        // eslint-disable-next-line no-use-before-define
        const resendIt = await getResendStream(client, {
            streamId, streamPartition, from, to, publisherId, msgChainId,
        }).subscribe()

        if (done) { return }

        for await (const { streamMessage } of resendIt) {
            if (done) { return }
            orderingUtil.add(streamMessage)
        }
    }, gapFillTimeout, retryResendAfter)

    const markMessageExplicitly = orderingUtil.markMessageExplicitly.bind(orderingUtil)

    return Object.assign(pipeline([
        // eslint-disable-next-line require-yield
        async function* WriteToOrderingUtil(src) {
            for await (const msg of src) {
                orderingUtil.add(msg)
            }
        },
        outStream,
        async function* WriteToOrderingUtil(src) {
            for await (const msg of src) {
                yield msg
            }
        },
    ], async (err) => {
        done = true
        orderingUtil.clearGaps()
        await outStream.cancel(err)
        orderingUtil.clearGaps()
    }), {
        markMessageExplicitly,
    })
}

export function Validator(client, opts) {
    const options = validateOptions(opts)
    const cacheOptions = client.options.cache
    const getStream = CacheAsyncFn(client.getStream.bind(client), cacheOptions)
    const isStreamPublisher = CacheAsyncFn(client.isStreamPublisher.bind(client), cacheOptions)
    const isStreamSubscriber = CacheAsyncFn(client.isStreamSubscriber.bind(client), cacheOptions)

    const validator = new StreamMessageValidator({
        getStream,
        isPublisher: CacheAsyncFn(async (publisherId, _streamId) => (
            isStreamPublisher(_streamId, publisherId)
        ), cacheOptions),
        isSubscriber: CacheAsyncFn(async (ethAddress, _streamId) => (
            isStreamSubscriber(_streamId, ethAddress)
        ), cacheOptions)
    })

    // return validation function that resolves in call order
    return pOrderedResolve(async (msg) => {
        // Check special cases controlled by the verifySignatures policy
        if (client.options.verifySignatures === 'never' && msg.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return msg // no validation required
        }

        if (options.verifySignatures === 'always' && !msg.signature) {
            throw new SignatureRequiredError(msg)
        }

        // In all other cases validate using the validator
        await validator.validate(msg) // will throw with appropriate validation failure
        return msg
    })
}

export function MessagePipeline(client, opts = {}, onFinally = () => {}) {
    const options = validateOptions(opts)
    const { validate = Validator(client, options) } = options

    const stream = messageStream(client.connection, options)
    const orderingUtil = OrderMessages(client, options)
    const p = pipeline([
        stream,
        async function* Validate(src) {
            for await (const { streamMessage } of src) {
                try {
                    yield await validate(streamMessage)
                } catch (err) {
                    if (err instanceof ValidationError) {
                        orderingUtil.markMessageExplicitly(streamMessage)
                        // eslint-disable-next-line no-continue
                        continue
                    }
                }
            }
        },
        orderingUtil,
    ], async (err, ...args) => {
        await stream.cancel()
        return onFinally(err, ...args)
    })

    return Object.assign(p, {
        stream,
        collect: collect.bind(null, p),
        end: stream.end,
    })
}

export function getResendStream(client, opts = {}, onFinally = () => {}) {
    const options = validateOptions(opts)
    const { connection } = client
    const requestId = uuid(`${options.key}-resend`)

    const msgStream = MessagePipeline(client, {
        ...options,
        type: ControlMessage.TYPES.UnicastMessage,
    }, async (err) => {
        try {
            await connection.removeHandle(requestId)
        } finally {
            await onFinally(err)
        }
    })

    // wait for resend complete message(s)
    const onResendDone = waitForResponse({ // eslint-disable-line promise/catch-or-return
        requestId,
        connection: client.connection,
        types: [
            ControlMessage.TYPES.ResendResponseResent,
            ControlMessage.TYPES.ResendResponseNoResend,
        ],
    }).then(() => msgStream.end(), (err) => msgStream.cancel(err))

    return Object.assign(msgStream, {
        async subscribe() {
            connection.addHandle(requestId)
            // wait for resend complete message or resend request done
            await Promise.race([
                resend(client, {
                    requestId,
                    ...options,
                }),
                onResendDone
            ])
            return this
        },
        async unsubscribe() {
            return this.cancel()
        }
    })
}
