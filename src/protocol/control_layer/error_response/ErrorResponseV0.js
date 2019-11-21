import { validateIsNotEmptyString } from '../../../utils/validations'
import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'
import ErrorResponse from './ErrorResponse'
import ErrorPayload from './ErrorPayload'
import ErrorResponseV1 from './ErrorResponseV1'

const VERSION = 0

export default class ErrorResponseV0 extends ErrorResponse {
    constructor(errorMessage) {
        super(VERSION)
        validateIsNotEmptyString('errorMessage', errorMessage)
        this.payload = new ErrorPayload(errorMessage)
    }

    toArray() {
        const array = super.toArray()
        array.push(...[
            null, // subId
            this.payload.toObject(),
        ])
        return array
    }

    toOtherVersion(version) {
        if (version === 1) {
            return new ErrorResponseV1(this.payload.error)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }

    static getConstructorArgs(array) {
        const errorObject = array[1] // index 0 is the null subId
        const payload = ErrorPayload.deserialize(errorObject)
        return [payload.error]
    }
}

ControlMessage.registerClass(VERSION, ErrorResponse.TYPE, ErrorResponseV0)
