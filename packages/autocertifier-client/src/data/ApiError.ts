import { ErrorCode } from '../errors'

export interface ApiError {
    code: ErrorCode
    message?: string
}
