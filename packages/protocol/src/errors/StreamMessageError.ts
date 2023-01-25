import StreamMessage from '../protocol/message_layer/StreamMessage'
import ValidationError from './ValidationError'

export default class StreamMessageError extends ValidationError {

    readonly streamMessage: StreamMessage

    constructor(msg: string, streamMessage: StreamMessage, code?: string) {
        super(msg, code)
        this.streamMessage = streamMessage
    }
}
