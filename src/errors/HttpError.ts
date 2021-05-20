import { Todo } from '../types'

export class HttpError extends Error {

    code: Todo
    method: Todo
    url: Todo

    constructor(code: Todo, method: Todo, url: Todo) {
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
