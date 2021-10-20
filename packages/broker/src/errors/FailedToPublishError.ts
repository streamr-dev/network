export class FailedToPublishError extends Error {
    constructor(streamId: string, reason: string) {
        super(`Failed publish to stream ${streamId}, reason: ${reason}`)
    }
}
