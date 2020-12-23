import StreamMessage from '../protocol/message_layer/StreamMessage'

export default class InvalidJsonError extends Error {

    streamId: string
    jsonString: string
    parseError: Error
    streamMessage: StreamMessage

    constructor(streamId: string, jsonString: string, parseError: Error, streamMessage: StreamMessage) {
        super(`Invalid JSON in stream ${streamId}: ${jsonString}. Error while parsing was: ${parseError}`)
        this.streamId = streamId
        this.jsonString = jsonString
        this.parseError = parseError
        this.streamMessage = streamMessage
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
