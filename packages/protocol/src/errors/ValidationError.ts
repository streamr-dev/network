import {StreamMessage} from "../protocol/message_layer"

export default class ValidationError extends Error {
    streamMessage?: StreamMessage
    code?: string
    constructor(msg: string, streamMessage?: StreamMessage, code?: string) {
        super(msg)
        this.streamMessage = streamMessage
        this.code = code
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
