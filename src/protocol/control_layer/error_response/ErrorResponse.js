import ControlMessage from '../ControlMessage'
import { validateIsString } from '../../../utils/validations'

export default class ErrorResponse extends ControlMessage {
    constructor(version, requestId, errorMessage, errorCode) {
        super(version, ControlMessage.TYPES.ErrorResponse, requestId)

        validateIsString('errorMessage', errorMessage)
        this.errorMessage = errorMessage

        // Since V2
        if (version >= 2) {
            validateIsString('errorCode', errorCode)
            this.errorCode = errorCode
        }
    }

    static create(requestId, errorMessage, errorCode) {
        return new ErrorResponse(ControlMessage.LATEST_VERSION, requestId, errorMessage, errorCode)
    }
}
