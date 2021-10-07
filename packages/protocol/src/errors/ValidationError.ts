export default class ValidationError extends Error {
    constructor(msg: string, public code?: string) {
        super(msg)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
