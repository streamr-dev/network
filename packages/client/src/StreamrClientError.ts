class StreamrClientError extends Error {
    constructor(message: string, readonly errorCode?: 'NO_STORAGE_NODES') {
        super(message)
        Error.captureStackTrace(this, StreamrClientError)
        this.name = this.constructor.name
    }
}
