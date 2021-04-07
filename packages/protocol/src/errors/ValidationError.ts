export default class ValidationError extends Error {
    constructor(msg: string) {
        super(msg)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
