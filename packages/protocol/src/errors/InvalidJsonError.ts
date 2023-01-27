import StreamMessage from '../protocol/message_layer/StreamMessage'
import StreamMessageError from './StreamMessageError'

export default class InvalidJsonError extends StreamMessageError {

    readonly parseError: Error

    constructor(streamId: string, parseError: Error, streamMessage: StreamMessage) {
        super(`Invalid JSON in stream ${streamId}: ${parseError}`, streamMessage)
        this.parseError = parseError
    }
}
