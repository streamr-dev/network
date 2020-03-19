export default class AuthFetchError extends Error {
    constructor(message, response, body) {
        // add leading space if there is a body set
        const bodyMessage = body ? ` ${(typeof body === 'string' ? body : JSON.stringify(body))}` : ''
        super(message + bodyMessage)
        this.response = response
        this.body = body

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
