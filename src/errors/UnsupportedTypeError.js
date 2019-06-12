module.exports = class UnsupportedTypeError extends Error {
    constructor(type, message) {
        super(`Unsupported type: ${type}, message: ${message}`)
        this.type = type
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
