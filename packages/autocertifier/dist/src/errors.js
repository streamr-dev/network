"use strict";
/* eslint-disable max-len */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerError = exports.FailedToConnectToStreamrWebSocket = exports.InvalidSubdomainOrToken = exports.DatabaseError = exports.SteamrWebSocketPortMissing = exports.TokenMissing = exports.FailedToExtractIpAddress = exports.UnspecifiedError = exports.Err = exports.ErrorCode = void 0;
const HttpStatus_1 = require("./data/HttpStatus");
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["FAILED_TO_EXTRACT_IP_ADDRESS"] = "FAILED_TO_EXTRACT_IP_ADDRESS";
    ErrorCode["UNSPECIFIED_ERROR"] = "UNSPECIFIED_ERROR";
    ErrorCode["TOKEN_MISSING"] = "TOKEN_MISSING";
    ErrorCode["STREAMR_WEBSOCKET_PORT_MISSING"] = "STREAMR_WEBSOCKET_PORT_MISSING";
    ErrorCode["DATABASE_ERROR"] = "DATABASE_ERROR";
    ErrorCode["INVALID_SUBDOMAIN_OR_TOKEN"] = "INVALID_SUBDOMAIN_OR_TOKEN";
    ErrorCode["SERVER_ERROR"] = "SERVER_ERROR";
    ErrorCode["FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET"] = "FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
class Err extends Error {
    constructor(code, httpStatus, message, originalError) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.originalError = originalError;
    }
    toApiError() {
        const ret = {
            code: this.code,
        };
        if (this.message) {
            ret.message = this.message;
        }
        return ret;
    }
}
exports.Err = Err;
class UnspecifiedError extends Err {
    constructor(message, originalError) { super(ErrorCode.UNSPECIFIED_ERROR, HttpStatus_1.HttpStatus.INTERNAL_SERVER_ERROR, message, originalError); }
}
exports.UnspecifiedError = UnspecifiedError;
class FailedToExtractIpAddress extends Err {
    constructor(message, originalError) { super(ErrorCode.FAILED_TO_EXTRACT_IP_ADDRESS, HttpStatus_1.HttpStatus.INTERNAL_SERVER_ERROR, message, originalError); }
}
exports.FailedToExtractIpAddress = FailedToExtractIpAddress;
class TokenMissing extends Err {
    constructor(message, originalError) { super(ErrorCode.TOKEN_MISSING, HttpStatus_1.HttpStatus.BAD_REQUEST, message, originalError); }
}
exports.TokenMissing = TokenMissing;
class SteamrWebSocketPortMissing extends Err {
    constructor(message, originalError) { super(ErrorCode.STREAMR_WEBSOCKET_PORT_MISSING, HttpStatus_1.HttpStatus.BAD_REQUEST, message, originalError); }
}
exports.SteamrWebSocketPortMissing = SteamrWebSocketPortMissing;
class DatabaseError extends Err {
    constructor(message, originalError) { super(ErrorCode.DATABASE_ERROR, HttpStatus_1.HttpStatus.INTERNAL_SERVER_ERROR, message, originalError); }
}
exports.DatabaseError = DatabaseError;
class InvalidSubdomainOrToken extends Err {
    constructor(message, originalError) { super(ErrorCode.INVALID_SUBDOMAIN_OR_TOKEN, HttpStatus_1.HttpStatus.UNAUTHORIZED, message, originalError); }
}
exports.InvalidSubdomainOrToken = InvalidSubdomainOrToken;
class FailedToConnectToStreamrWebSocket extends Err {
    constructor(message, originalError) { super(ErrorCode.FAILED_TO_CONNECT_TO_STREAMR_WEBSOCKET, HttpStatus_1.HttpStatus.INTERNAL_SERVER_ERROR, message, originalError); }
}
exports.FailedToConnectToStreamrWebSocket = FailedToConnectToStreamrWebSocket;
class ServerError extends Err {
    constructor(originalError) {
        super(ErrorCode.SERVER_ERROR, originalError.httpStatus, originalError.message, originalError);
    }
}
exports.ServerError = ServerError;
//# sourceMappingURL=errors.js.map