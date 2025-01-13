export class ValidationError extends Error {
    public code?: string

    constructor(msg: string, code?: string) {
        super(msg)
        this.code = code
    }
}
