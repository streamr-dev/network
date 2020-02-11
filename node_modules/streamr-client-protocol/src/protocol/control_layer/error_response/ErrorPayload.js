import { ensureParsed } from '../../../utils/ParseUtil'

export default class ErrorPayload {
    constructor(errorString) {
        this.error = errorString
    }

    toObject() {
        return {
            error: this.error,
        }
    }

    static deserialize(stringOrObject) {
        const msg = ensureParsed(stringOrObject)
        if (!msg.error) {
            throw new Error(`Invalid error payload received: ${JSON.stringify(msg)}`)
        }
        return new ErrorPayload(msg.error)
    }
}
