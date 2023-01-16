export default class UnsupportedVersionError extends Error {
    constructor(readonly version: number, message: string) {
        super(`Unsupported version: ${version}, message: ${message}`)
    }
}
