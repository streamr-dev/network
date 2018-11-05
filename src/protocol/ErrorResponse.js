import WebsocketResponse from './WebsocketResponse'
import ErrorPayload from './ErrorPayload'

const TYPE = 7

class ErrorResponse extends WebsocketResponse {
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

WebsocketResponse.registerMessageClass(ErrorResponse, TYPE)
module.exports = ErrorResponse
