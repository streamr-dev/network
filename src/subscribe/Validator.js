import { inspect } from 'util'

import { MessageLayer, Utils, Errors } from 'streamr-client-protocol'

import { pOrderedResolve } from '../utils'
import { validateOptions } from '../stream/utils'

const { StreamMessageValidator } = Utils
const { ValidationError } = Errors
const { StreamMessage, GroupKeyErrorResponse } = MessageLayer

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

/**
 * Wrap StreamMessageValidator in a way that ensures it can validate in parallel but
 * validation is guaranteed to resolve in the same order they were called
 * Handles caching remote calls
 */

export default function Validator(client, opts) {
    const options = validateOptions(opts)
    const validator = new StreamMessageValidator({
        getStream: client.getStream.bind(client),
        async isPublisher(publisherId, _streamId) {
            return client.cached.isStreamPublisher(_streamId, publisherId)
        },
        async isSubscriber(ethAddress, _streamId) {
            return client.cached.isStreamSubscriber(_streamId, ethAddress)
        },
    })

    const validate = pOrderedResolve(async (msg) => {
        if (msg.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE) {
            const res = GroupKeyErrorResponse.fromArray(msg.getParsedContent())
            const err = new ValidationError(`GroupKeyErrorResponse: ${res.errorMessage}`, msg)
            err.code = res.errorCode
            throw err
        }

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

    // return validation function that resolves in call order
    return Object.assign(validate, {
        clear(key) {
            if (!key) {
                validate.clear()
            }
        }
    })
}
