export default class UnsupportedTypeError extends Error {

    readonly type: number

    constructor(type: number, message: string) {
        super(`Unsupported type: ${type}, message: ${message}`)
        this.type = type
    }
}
