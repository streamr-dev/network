import ControlMessage from '../ControlMessage'

import ErrorResponse from './ErrorResponse'

const VERSION = 1

export default class ErrorResponseSerializerV1 {
    static toArray(errorResponse) {
        return [
            VERSION,
            ControlMessage.TYPES.ErrorResponse,
            errorResponse.errorMessage,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            errorMessage,
        ] = arr

        return new ErrorResponse(version, null, errorMessage)
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ErrorResponse, ErrorResponseSerializerV1)
