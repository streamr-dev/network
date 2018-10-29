import MessageFromServer from './MessageFromServer'
import ErrorMessage from './ErrorMessage'

const TYPE = 7

class ErrorResponse extends MessageFromServer {
    constructor(errorMessage) {
        super(TYPE, errorMessage)
    }
    static getMessageName() {
        return 'ErrorResponse'
    }
    static getPayloadClass() {
        return ErrorMessage
    }
}

MessageFromServer.registerMessageClass(ErrorResponse, TYPE)
module.exports = ErrorResponse
