/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable max-len */

export enum ErrorCode {
    CONNECTION_FAILED = 'CONNECTION_FAILED',
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    RPC_TIMEOUT = 'RPC_TIMEOUT',
    RPC_REQUEST = 'RPC_REQUEST',
    COULD_NOT_ROUTE = 'COULD_NOT_ROUTE',
    NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
    UNKNOWN_RPC_METHOD = 'UNKNOWN_RPC_METHOD',
    LAYER_VIOLATION = 'LAYER_VIOLATION',
    WEBSOCKET_CONNECTION_REQUEST_REJECTED = 'WEBSOCKET_CONNECTION_REQUEST_REJECTED',
    COULD_NOT_START = 'COULD_NOT_START',
    COULD_NOT_STOP = 'COULD_NOT_STOP',
    CANNOT_CONNECT_TO_SELF = 'CANNOT_CONNECT_TO_SELF',
    FAILED_TO_PARSE = 'FAILED_TO_PARSE',
    FAILED_TO_SERIALIZE = 'FAILED_TO_SERIALIZE'
}

export namespace Err {

    class Err extends Error {
        constructor(public code: ErrorCode, message?: string, public originalError?: Error | string) {
            super(message)
        }
    }

    export class RpcTimeout extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.RPC_TIMEOUT, message, originalError) } }
    export class RpcRequest extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.RPC_REQUEST, message, originalError) } }
    export class NotImplemented extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.NOT_IMPLEMENTED, message, originalError) } }
    export class UnknownRpcMethod extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.UNKNOWN_RPC_METHOD, message, originalError) } }
    export class FailedToParse extends Err { constructor(message?: string, originalError?: Error |string) {super(ErrorCode.FAILED_TO_PARSE, message, originalError) } }
    export class FailedToSerialize extends Err { constructor(message?: string, originalError?: Error |string) {super(ErrorCode.FAILED_TO_SERIALIZE, message, originalError) } }

}
