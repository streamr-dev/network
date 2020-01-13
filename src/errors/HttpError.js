module.exports = class HttpError extends Error {
    constructor(code, method, url) {
        super(`${method} ${url} responded with status code ${code}`)
        Error.captureStackTrace(this, HttpError) // exclude this constructor from stack trace
        this.name = this.constructor.name

        this.code = code
        this.method = method
        this.url = url
    }

    toString() {
        return `HttpError ${this.method} ${this.url} responded with ${this.code}`
    }
}
