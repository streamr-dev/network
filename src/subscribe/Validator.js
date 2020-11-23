import { inspect } from 'util'

import { MessageLayer, Utils, Errors } from 'streamr-client-protocol'

import { CacheAsyncFn, pOrderedResolve } from '../utils'

import { validateOptions } from './api'

const { StreamMessageValidator } = Utils
const { ValidationError } = Errors
const { StreamMessage } = MessageLayer

const EMPTY_MESSAGE = {
    serialize() {}
}

export class SignatureRequiredError extends ValidationError {
    constructor(streamMessage = EMPTY_MESSAGE) {
        super(`Client requires data to be signed. Message: ${inspect(streamMessage)}`)
        this.streamMessage = streamMessage
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export default function Validator(client, opts) {
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
