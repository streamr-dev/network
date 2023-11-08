import { ErrorCode } from '../errors'

// TODO: only used by server package?
export interface ApiError {
    code: ErrorCode
    message?: string
}
