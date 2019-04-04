module.exports = class VerificationFailedError extends Error {
    constructor(streamMessage, cause) {
        super(`Verification failed for message: ${streamMessage.serialize()}, cause: ${cause}`)
        this.streamMessage = streamMessage
        this.cause = cause
    }
}
