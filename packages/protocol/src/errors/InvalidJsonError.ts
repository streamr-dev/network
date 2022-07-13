import StreamMessage from '../protocol/message_layer/StreamMessage'
import StreamMessageError from './StreamMessageError'

export default class InvalidJsonError extends StreamMessageError {
    constructor(streamId: string, readonly parseError: Error, readonly streamMessage: StreamMessage) {
        super(`Invalid JSON in stream ${streamId}: ${parseError}`, streamMessage)
    }
}
