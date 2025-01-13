import { StreamMessage } from './exports'
import { MessageID } from './protocol/MessageID'

export type StreamrClientErrorCode =
    | 'STREAM_NOT_FOUND'
    | 'NODE_NOT_FOUND'
    | 'MISSING_PERMISSION'
    | 'NO_STORAGE_NODES'
    | 'INVALID_ARGUMENT'
    | 'CLIENT_DESTROYED'
    | 'PIPELINE_ERROR'
    | 'UNSUPPORTED_OPERATION'
    | 'INVALID_MESSAGE_CONTENT'
    | 'INVALID_STREAM_METADATA'
    | 'INVALID_SIGNATURE'
    | 'INVALID_PARTITION'
    | 'DECRYPT_ERROR'
    | 'STORAGE_NODE_ERROR'
    | 'UNKNOWN_ERROR'
    | 'ASSERTION_FAILED'

export class StreamrClientError extends Error {
    public readonly code: StreamrClientErrorCode
    public readonly messageId?: MessageID

    constructor(message: string, code: StreamrClientErrorCode, streamMessage?: StreamMessage) {
        super(`${message} ${formErrorMessageSuffix(code, streamMessage)}`)
        this.code = code
        this.name = this.constructor.name
        this.messageId = streamMessage?.messageId
    }
}

const formErrorMessageSuffix = (code: StreamrClientErrorCode, streamMessage?: StreamMessage): string => {
    const parts: string[] = []
    parts.push(`code=${code}`)
    if (streamMessage !== undefined) {
        parts.push(`messageId=${formMessageIdDescription(streamMessage.messageId)}`)
    }
    return `(${parts.join(', ')})`
}

const formMessageIdDescription = (messageId: MessageID): string => {
    return JSON.stringify(messageId)
}
