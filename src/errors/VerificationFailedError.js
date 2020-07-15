export default class VerificationFailedError extends Error {
    constructor(streamMessage, cause) {
        super(`Verification failed for message: ${streamMessage.serialize()}, cause: ${cause.stack || cause}`)
        this.streamMessage = streamMessage
        this.cause = cause
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
