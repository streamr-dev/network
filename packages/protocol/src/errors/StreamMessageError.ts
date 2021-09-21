import { StreamMessage } from "../protocol/message_layer"
import ValidationError from './ValidationError'

export default class StreamMessageError extends ValidationError {
    constructor(msg: string, public streamMessage: StreamMessage, code?: string) {
        super(msg, code)
    }
}
