
export default class UnsupportedTypeError extends Error {
    
    type: number
    
    constructor(type: number, message: string) {
        super(`Unsupported type: ${type}, message: ${message}`)
        this.type = type
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
