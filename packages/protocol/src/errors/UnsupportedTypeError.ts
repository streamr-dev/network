export default class UnsupportedTypeError extends Error {
    constructor(readonly type: number, message: string) {
        super(`Unsupported type: ${type}, message: ${message}`)
    }
}
