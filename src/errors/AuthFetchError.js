export default class AuthFetchError extends Error {
    constructor(message, response, body) {
        super(message)
        this.response = response
        this.body = body

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
