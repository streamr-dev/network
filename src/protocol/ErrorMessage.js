import ParseUtil from '../utils/ParseUtil'

module.exports = class ErrorMessage {
    constructor(errorString) {
        this.error = errorString
    }

    toObject() {
        return {
            error: this.error,
        }
    }

    static deserialize(stringOrObject) {
        const msg = ParseUtil.ensureParsed(stringOrObject)
        if (!msg.error) {
            throw new Error(`Invalid error message received: ${JSON.stringify(msg)}`)
        }
        return new ErrorMessage(msg.error)
    }
}
