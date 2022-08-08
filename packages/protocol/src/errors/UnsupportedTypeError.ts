export default class UnsupportedTypeError extends Error {
    constructor(readonly type: number, message: string) {
        super(`Unsupported type: ${type}, message: ${message}`)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
