import StreamMessage from '../protocol/message_layer/StreamMessage'
import ValidationError from './ValidationError'

export default class StreamMessageError extends ValidationError {
    constructor(msg: string, readonly streamMessage: StreamMessage, code?: string) {
        super(msg, code)
    }
}
