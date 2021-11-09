export class HttpError extends Error {
    readonly code: number
    readonly method: string
    readonly url: string

    constructor(code: number, method: string, url: string) {
        super(`${method} ${url} responded with status code ${code}`)
        Error.captureStackTrace(this, HttpError) // exclude this constructor from stack trace
        this.name = this.constructor.name

        this.code = code
        this.method = method
        this.url = url
    }

    toString(): string {
        return `HttpError ${this.method} ${this.url} responded with ${this.code}`
    }
}
