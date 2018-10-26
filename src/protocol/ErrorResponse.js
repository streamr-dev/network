module.exports = class ErrorResponse {
    constructor(errorMessage) {
        this.errorMessage = errorMessage
    }

    static getMessageType() {
        return 7
    }
    static getMessageName() {
        return 'ErrorResponse'
    }

    toObject() {
        return {
            error: this.errorMessage,
        }
    }

    serialize() {
        return JSON.stringify(this.toObject())
    }

    static deserialize(stringOrObject) {
        const msg = (typeof stringOrObject === 'string' ? JSON.parse(stringOrObject) : stringOrObject)
        if (!msg.error) {
            throw new Error(`Invalid error message received: ${JSON.stringify(msg)}`)
        }
        return new ErrorResponse(msg.error)
    }
}
