import { Errors } from 'streamr-client-protocol'

const EMPTY_MESSAGE = {
    serialize() {}
}

export default class SignatureRequiredError extends Errors.ValidationError {
    constructor(streamMessage = EMPTY_MESSAGE) {
        super(`Client requires data to be signed. Message: ${streamMessage.serialize()}`)
        this.streamMessage = streamMessage
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
