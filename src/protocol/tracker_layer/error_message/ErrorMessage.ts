import {
    validateIsOneOf,
    validateIsNotEmptyString,
} from '../../../utils/validations'
import TrackerMessage, { TrackerMessageOptions } from '../TrackerMessage'

export enum ErrorCode {
    RTC_UNKNOWN_PEER = 'RTC_UNKNOWN_PEER'
}

export interface Options extends TrackerMessageOptions {
    errorCode: ErrorCode
    targetNode: string
}

export default class ErrorMessage extends TrackerMessage {
    
    static ERROR_CODES = ErrorCode // TODO can we remove this and use the enum object directly?

    errorCode: ErrorCode
    targetNode: string

    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, errorCode, targetNode }: Options) {
        super(version, TrackerMessage.TYPES.ErrorMessage, requestId)

        validateIsOneOf('errorCode', errorCode, Object.values(ErrorMessage.ERROR_CODES))
        validateIsNotEmptyString('targetNode', targetNode)

        this.errorCode = errorCode
        this.targetNode = targetNode
    }
}
