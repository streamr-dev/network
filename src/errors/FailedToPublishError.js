module.exports = class FailedToPublishError extends Error {
    constructor(streamId, reason) {
        super(`Publish to stream ${streamId} failed: ${reason}`)
    }
}
