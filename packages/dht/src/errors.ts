/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable max-len */

export enum ErrorCode {
    CONNECTION_FAILED = 'CONNECTION_FAILED',
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    RPC_TIMEOUT = 'RPC_TIMEOUT'
}

export namespace Err {

    class Err extends Error {
        constructor(public code: ErrorCode, message?: string, public originalError?: Error | string) {
            super(message)
        }
    }

    export class ConnectionFailed extends Err { constructor( message?: string, originalError?: Error | string) { super(ErrorCode.CONNECTION_FAILED, message, originalError) } }
    export class FileNotFound extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.FILE_NOT_FOUND, message, originalError) } }
    export class RpcTimeoutError extends Err { constructor(message?: string, originalError?: Error | string) { super(ErrorCode.RPC_TIMEOUT, message, originalError) } }
}
