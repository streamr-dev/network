import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'
import ErrorResponse from './ErrorResponse'
import ErrorResponseV0 from './ErrorResponseV0'

const VERSION = 1

export default class ErrorResponseV1 extends ErrorResponse {
    constructor(errorMessage) {
        super(VERSION)
        this.errorMessage = errorMessage
    }

    toArray() {
        const array = super.toArray()
        array.push(...[
            this.errorMessage,
        ])
        return array
    }

    toOtherVersion(version) {
        if (version === 0) {
            return new ErrorResponseV0(this.errorMessage)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }
}

ControlMessage.registerClass(VERSION, ErrorResponse.TYPE, ErrorResponseV1)
