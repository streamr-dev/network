export enum ErrorCode {
    NOT_FOUND = 'NOT_FOUND',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    UNKNOWN = 'UNKNOWN'
}

export const parseErrorCode = (body: string) => {
    let json
    try {
        json = JSON.parse(body)
    } catch (err) {
        return ErrorCode.UNKNOWN
    }
    const code = json.code
    const keys = Object.keys(ErrorCode)
    if (keys.includes(code)) {
        return code as ErrorCode
    }
    return ErrorCode.UNKNOWN
}
