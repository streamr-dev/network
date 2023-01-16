export default class ValidationError extends Error {
    constructor(msg: string, public code?: string) {
        super(msg)
    }
}
