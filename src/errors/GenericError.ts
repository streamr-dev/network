export class GenericError extends Error {

    code: string

    constructor(message: string, code: string) {
        super(message)
        this.code = code
    }
}
