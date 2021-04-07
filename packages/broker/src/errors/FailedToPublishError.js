module.exports = class FailedToPublishError extends Error {
    constructor(streamId, reason) {
        super(`Failed publish to stream ${streamId}, reason: ${reason}`)
    }
}
