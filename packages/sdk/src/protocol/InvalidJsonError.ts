import { StreamMessage } from './StreamMessage'
import { StreamMessageError } from './StreamMessageError'

export class InvalidJsonError extends StreamMessageError {

    readonly parseError: Error

    constructor(streamId: string, parseError: Error, streamMessage: StreamMessage) {
        super(`Invalid JSON in stream ${streamId}: ${parseError}`, streamMessage)
        this.parseError = parseError
    }
}
