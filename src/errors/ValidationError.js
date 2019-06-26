export default class ValidationError extends Error {
    constructor(...args) {
        super(...args)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
