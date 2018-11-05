import MessageFromServer from './MessageFromServer'
import ErrorPayload from './ErrorPayload'

const TYPE = 7

class ErrorResponse extends MessageFromServer {
    constructor(errorMessage) {
        super(TYPE, new ErrorPayload(errorMessage))
    }
    static getMessageName() {
        return 'ErrorResponse'
    }
    static getPayloadClass() {
        return ErrorPayload
    }
    static getConstructorArguments(message, payload) {
        return [payload.error]
    }
}

MessageFromServer.registerMessageClass(ErrorResponse, TYPE)
module.exports = ErrorResponse
