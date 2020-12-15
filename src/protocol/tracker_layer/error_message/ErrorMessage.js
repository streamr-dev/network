import {
    validateIsOneOf,
    validateIsNotEmptyString,
} from '../../../utils/validations'
import TrackerMessage from '../TrackerMessage'

const ERROR_CODES = Object.freeze({
    RTC_UNKNOWN_PEER: 'RTC_UNKNOWN_PEER'
})

export default class ErrorMessage extends TrackerMessage {
    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, errorCode, targetNode }) {
        super(version, TrackerMessage.TYPES.ErrorMessage, requestId)

        validateIsOneOf('errorCode', errorCode, Object.values(ERROR_CODES))
        validateIsNotEmptyString('targetNode', targetNode)

        this.errorCode = errorCode
        this.targetNode = targetNode
    }
}

ErrorMessage.ERROR_CODES = ERROR_CODES
