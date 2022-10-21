export type StreamrClientErrorCode = 'NO_STORAGE_NODES' | 'INVALID_ARGUMENT' | 'CLIENT_IS_DESTROYED' | 'PIPELINE_ERROR'

export class StreamrClientError extends Error {
    constructor(message: string, public readonly code: StreamrClientErrorCode) {
        super(message)
        this.name = this.constructor.name
    }
}
