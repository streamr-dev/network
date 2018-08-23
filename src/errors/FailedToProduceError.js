module.exports = class FailedToProduceError extends Error {
    constructor(streamId, msg, reason) {
        super(`Failed to produce to stream ${streamId} due to: ${reason}. Message was: ${msg}`)
        this.streamId = streamId
        this.msg = msg
        this.reason = reason
    }
}
