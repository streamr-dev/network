import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { validateIsString } from '../../../utils/validations'

export enum ErrorCode {
    INVALID_REQUEST = 'INVALID_REQUEST',
    ERROR_WHILE_HANDLING_REQUEST = 'ERROR_WHILE_HANDLING_REQUEST',
    AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    NOT_FOUND = 'NOT_FOUND',
    FUTURE_TIMESTAMP = 'FUTURE_TIMESTAMP',
    REQUEST_FAILED = 'REQUEST_FAILED',
    RESEND_FAILED = 'RESEND_FAILED',
    UNKNOWN = 'UNKNOWN'
}

export interface Options extends ControlMessageOptions {
    errorMessage: string
    errorCode: ErrorCode
}

export default class ErrorResponse extends ControlMessage {

    errorMessage: string
    errorCode: ErrorCode
    
    constructor({ version = ControlMessage.LATEST_VERSION, requestId, errorMessage, errorCode }: Options) {
        super(version, ControlMessage.TYPES.ErrorResponse, requestId)

        validateIsString('errorMessage', errorMessage)
        this.errorMessage = errorMessage

        // Since V2
        if (version >= 2) {
            validateIsString('errorCode', errorCode)
        }
        this.errorCode = errorCode
    }
}
