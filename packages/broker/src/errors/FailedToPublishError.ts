import { Todo } from '../types'

export class FailedToPublishError extends Error {
    constructor(streamId: Todo, reason: Todo) {
        super(`Failed publish to stream ${streamId}, reason: ${reason}`)
    }
}
