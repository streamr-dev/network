export default class FailedToPublishError extends Error {
    constructor(streamId, msg, reason) {
        super(`Failed to publish to stream ${streamId} due to: ${reason}. Message was: ${msg}`)
        this.streamId = streamId
        this.msg = msg
        this.reason = reason
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
