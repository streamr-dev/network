import ControlMessage from '../ControlMessage'

import ErrorResponse from './ErrorResponse'

const VERSION = 2

export default class ErrorResponseSerializerV2 {
    static toArray(errorResponse) {
        return [
            VERSION,
            ControlMessage.TYPES.ErrorResponse,
            errorResponse.requestId,
            errorResponse.errorMessage,
            errorResponse.errorCode,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            errorMessage,
            errorCode,
        ] = arr

        return new ErrorResponse(version, requestId, errorMessage, errorCode)
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ErrorResponse, ErrorResponseSerializerV2)
