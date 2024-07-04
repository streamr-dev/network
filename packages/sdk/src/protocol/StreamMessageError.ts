import { StreamMessage } from './StreamMessage'
import { ValidationError } from './ValidationError'

export class StreamMessageError extends ValidationError {

    readonly streamMessage: StreamMessage

    constructor(msg: string, streamMessage: StreamMessage, code?: string) {
        super(msg, code)
        this.streamMessage = streamMessage
    }
}
