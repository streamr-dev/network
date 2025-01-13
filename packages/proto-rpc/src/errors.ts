export enum ErrorCode {
    RPC_TIMEOUT = 'RPC_TIMEOUT',
    RPC_REQUEST = 'RPC_REQUEST',
    RPC_SERVER_ERROR = 'RPC_SERVER_ERROR',
    RPC_CLIENT_ERROR = 'RPC_CLIENT_ERROR',
    NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
    UNKNOWN_RPC_METHOD = 'UNKNOWN_RPC_METHOD',
    FAILED_TO_PARSE = 'FAILED_TO_PARSE',
    FAILED_TO_SERIALIZE = 'FAILED_TO_SERIALIZE',
    DISCONNECTED = 'DISCONNECTED'
}

class Err extends Error {
    public code: ErrorCode
    public originalError?: Error | string

    constructor(code: ErrorCode, message?: string, originalError?: Error | string) {
        super(message)
        this.code = code
        this.originalError = originalError
    }
}

export class RpcTimeout extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.RPC_TIMEOUT, message, originalError)
    }
}
export class RpcRequest extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.RPC_REQUEST, message, originalError)
    }
}
export class RpcServerError extends Err {
    public errorClassName?: string
    public errorCode?: string

    constructor(errorMessage?: string, errorClassName?: string, errorCode?: string) {
        super(ErrorCode.RPC_SERVER_ERROR, errorMessage)
        this.errorClassName = errorClassName
        this.errorCode = errorCode
    }
}
export class RpcClientError extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.RPC_CLIENT_ERROR, message, originalError)
    }
}
export class NotImplemented extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.NOT_IMPLEMENTED, message, originalError)
    }
}
export class UnknownRpcMethod extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.UNKNOWN_RPC_METHOD, message, originalError)
    }
}
export class FailedToParse extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.FAILED_TO_PARSE, message, originalError)
    }
}
export class FailedToSerialize extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.FAILED_TO_SERIALIZE, message, originalError)
    }
}
export class Disconnected extends Err {
    constructor(message?: string, originalError?: Error | string) {
        super(ErrorCode.DISCONNECTED, message, originalError)
    }
}
