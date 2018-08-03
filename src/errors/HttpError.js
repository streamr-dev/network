module.exports = class HttpError extends Error {
    constructor(code, message) {
        super(message)
        this.code = code
    }

    toString() {
        return `HttpError ${this.code}: ${this.message}`
    }
}
