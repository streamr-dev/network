export default class UnsupportedVersionError extends Error {
    
    version: number

    constructor(version: number, message: string) {
        super(`Unsupported version: ${version}, message: ${message}`)
        this.version = version
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
