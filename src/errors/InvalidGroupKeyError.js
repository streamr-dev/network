export default class InvalidGroupKeyError extends Error {
    constructor(message) {
        super(message)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
