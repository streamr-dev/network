import { ApiError } from './data/ApiError';
import { HttpStatus } from './data/HttpStatus';
export declare enum ErrorCode {
    FAILED_TO_EXTRACT_IP_ADDRESS = "FAILED_TO_EXTRACT_IP_ADDRESS",
    UNSPECIFIED_ERROR = "UNSPECIFIED_ERROR",
    TOKEN_MISSING = "TOKEN_MISSING",
    STREAMR_WEBSOCKET_PORT_MISSING = "STREAMR_WEBSOCKET_PORT_MISSING",
    DATABASE_ERROR = "DATABASE_ERROR",
    INVALID_SUBDOMAIN_OR_TOKEN = "INVALID_SUBDOMAIN_OR_TOKEN",
    FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET = "FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET",
    SERVER_ERROR = "SERVER_ERROR"
}
export declare class Err extends Error {
    code: ErrorCode;
    httpStatus: HttpStatus;
    originalError?: Error | string;
    constructor(code: ErrorCode, httpStatus: HttpStatus, message?: string, originalError?: Error | string);
    toApiError(): ApiError;
}
export declare class UnspecifiedError extends Err {
    constructor(message?: string, originalError?: Error | string);
}
export declare class FailedToExtractIpAddress extends Err {
    constructor(message?: string, originalError?: Error | string);
}
export declare class TokenMissing extends Err {
    constructor(message?: string, originalError?: Error | string);
}
export declare class SteamrWebSocketPortMissing extends Err {
    constructor(message?: string, originalError?: Error | string);
}
export declare class DatabaseError extends Err {
    constructor(message?: string, originalError?: Error | string);
}
export declare class InvalidSubdomainOrToken extends Err {
    constructor(message?: string, originalError?: Error | string);
}
export declare class FailedToConnectToStreamrWebSocket extends Err {
    constructor(message?: string, originalError?: Error | string);
}
export declare class ServerError extends Err {
    constructor(originalError: Err);
}
