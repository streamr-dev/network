export type StreamrClientErrorCode = 
    'MISSING_PERMISSION' | 
    'NO_STORAGE_NODES' | 
    'INVALID_ARGUMENT' | 
    'CLIENT_DESTROYED' | 
    'PIPELINE_ERROR' |
    'UNKNOWN_ERROR'

export class StreamrClientError extends Error {
    constructor(message: string, public readonly code: StreamrClientErrorCode) {
        super(message)
        this.name = this.constructor.name
    }
}
