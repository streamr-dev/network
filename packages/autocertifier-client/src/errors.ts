import { ApiError } from './data/ApiError'
import { HttpStatus } from './data/HttpStatus'

export enum ErrorCode {
    FAILED_TO_EXTRACT_IP_ADDRESS = 'FAILED_TO_EXTRACT_IP_ADDRESS',
    UNSPECIFIED_ERROR = 'UNSPECIFIED_ERROR',
    TOKEN_MISSING = 'TOKEN_MISSING',
    STREAMR_WEBSOCKET_PORT_MISSING = 'STREAMR_WEBSOCKET_PORT_MISSING',
    DATABASE_ERROR = 'DATABASE_ERROR',
    INVALID_SUBDOMAIN_OR_TOKEN = 'INVALID_SUBDOMAIN_OR_TOKEN',
    FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET = 'FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET',
    SERVER_ERROR = 'SERVER_ERROR'
}

// TODO: fix name, probably only used by server?
export class Err extends Error {
    readonly code: ErrorCode
    // TODO: could remove httpStatus since we already have a higher level error?
    readonly httpStatus: HttpStatus
    readonly originalError?: Error | string

    constructor(code: ErrorCode, httpStatus: HttpStatus, message?: string, originalError?: Error | string) {
        super(message)
        this.code = code
        this.httpStatus = httpStatus
        this.originalError = originalError
    }

    public toApiError(): ApiError {
        return {
            code: this.code,
            message: this.message
        }
    }
}

// TODO: many of these errors are used from 'autocertifier-server' and not in this package, should be moved there
export class UnspecifiedError extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.UNSPECIFIED_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, message, originalError)
    }
}
export class FailedToExtractIpAddress extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.FAILED_TO_EXTRACT_IP_ADDRESS, HttpStatus.INTERNAL_SERVER_ERROR, message, originalError)
    }
}
export class TokenMissing extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.TOKEN_MISSING, HttpStatus.BAD_REQUEST, message, originalError)
    }
}
export class SteamrWebSocketPortMissing extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.STREAMR_WEBSOCKET_PORT_MISSING, HttpStatus.BAD_REQUEST, message, originalError)
    }
}
export class DatabaseError extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.DATABASE_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, message, originalError)
    }
}
export class InvalidSubdomainOrToken extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.INVALID_SUBDOMAIN_OR_TOKEN, HttpStatus.UNAUTHORIZED, message, originalError)
    }
}
export class FailedToConnectToStreamrWebSocket extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(
            ErrorCode.FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET,
            HttpStatus.INTERNAL_SERVER_ERROR,
            message,
            originalError
        )
    }
}
export class ServerError extends Err {
    constructor(originalError: Err) {
        super(ErrorCode.SERVER_ERROR, originalError.httpStatus, originalError.message, originalError)
    }
}
