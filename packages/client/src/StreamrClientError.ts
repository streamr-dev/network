export type StreamrClientErrorCode = 
    'MISSING_PERMISSION' | 
    'NO_STORAGE_NODES' | 
    'INVALID_ARGUMENT' | 
    'CLIENT_DESTROYED' | 
    'PIPELINE_ERROR' |
    'UNSUPPORTED_OPERATION' |
    'INVALID_STREAM_METADATA' |
    'UNKNOWN_ERROR'

export class StreamrClientError extends Error {

    public readonly code: StreamrClientErrorCode

    constructor(message: string, code: StreamrClientErrorCode) {
        super(message)
        this.code = code
        this.name = this.constructor.name
    }
}
