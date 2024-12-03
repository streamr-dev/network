import { StreamMessage } from './exports'
import { MessageID } from './protocol/MessageID'

export type StreamrClientErrorCode =
    'STREAM_NOT_FOUND' |
    'NODE_NOT_FOUND' |
    'MISSING_PERMISSION' |
    'NO_STORAGE_NODES' |
    'INVALID_ARGUMENT' |
    'CLIENT_DESTROYED' |
    'PIPELINE_ERROR' |
    'UNSUPPORTED_OPERATION' |
    'INVALID_STREAM_METADATA' |
    'DECRYPT_ERROR' |
    'STORAGE_NODE_ERROR' |
    'UNKNOWN_ERROR'

export class StreamrClientError extends Error {

    public readonly code: StreamrClientErrorCode

    constructor(message: string, code: StreamrClientErrorCode, streamMessage?: StreamMessage) {
        super(streamMessage === undefined ? message : `${message} (messageId=${formMessageIdDescription(streamMessage.messageId)})`)
        this.code = code
        this.name = this.constructor.name
    }
}

const formMessageIdDescription = (messageId: MessageID): string => {
    return JSON.stringify(messageId)
}
