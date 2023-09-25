/* eslint-disable max-len */

import { ApiError } from './data/ApiError'
import { HttpStatus } from './data/HttpStatus'

export enum ErrorCode {
    FAILED_TO_EXTRACT_IP_ADDRESS = 'FAILED_TO_EXTRACT_IP_ADDRESS',
    UNSPECIFIED_ERROR = 'UNSPECIFIED_ERROR',
    TOKEN_MISSING = 'TOKEN_MISSING',
    STREAMR_WEBSOCKET_PORT_MISSING = 'STREAMR_WEBSOCKET_PORT_MISSING',
    DATABASE_ERROR = 'DATABASE_ERROR',
    INVALID_SUBDOMAIN_OR_TOKEN = 'INVALID_SUBDOMAIN_OR_TOKEN',
    SERVER_ERROR = 'SERVER_ERROR',
    FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET = 'FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET'
}

export class Err extends Error {

    public code: ErrorCode
    public httpStatus: HttpStatus
    public originalError?: Error | string

    constructor(code: ErrorCode, httpStatus: HttpStatus, message?: string, originalError?: Error | string) {
        super(message)
        this.code = code
        this.httpStatus = httpStatus
        this.originalError = originalError
    }

    public toApiError(): ApiError {
        const ret: ApiError = {
            code: this.code,
        }
        if (this.message) {
            ret.message = this.message
        }
        return ret
    }
}

export class UnspecifiedError extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.UNSPECIFIED_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, message, originalError) } }
export class FailedToExtractIpAddress extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.FAILED_TO_EXTRACT_IP_ADDRESS, HttpStatus.INTERNAL_SERVER_ERROR, message, originalError) } }
export class TokenMissing extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.TOKEN_MISSING, HttpStatus.BAD_REQUEST, message, originalError) } }
export class SteamrWebSocketPortMissing extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.STREAMR_WEBSOCKET_PORT_MISSING, HttpStatus.BAD_REQUEST, message, originalError) } }
export class DatabaseError extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.DATABASE_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, message, originalError) } }
export class InvalidSubdomainOrToken extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.INVALID_SUBDOMAIN_OR_TOKEN, HttpStatus.UNAUTHORIZED, message, originalError) } }
export class FailedToConnectToStreamrWebSocket extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET, HttpStatus.INTERNAL_SERVER_ERROR, message, originalError) } }
export class ServerError extends Err { 
    constructor(originalError: Err) { 
        super(ErrorCode.SERVER_ERROR, originalError.httpStatus, originalError.message, originalError) 
    } 
}
