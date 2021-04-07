import ControlMessage from '../ControlMessage'

import ErrorResponse from './ErrorResponse'

import { Serializer } from '../../../Serializer'
const VERSION = 2

export default class ErrorResponseSerializerV2 extends Serializer<ErrorResponse> {
    toArray(errorResponse: ErrorResponse) {
        return [
            VERSION,
            ControlMessage.TYPES.ErrorResponse,
            errorResponse.requestId,
            errorResponse.errorMessage,
            errorResponse.errorCode,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            errorMessage,
            errorCode,
        ] = arr

        return new ErrorResponse({
            version, requestId, errorMessage, errorCode
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ErrorResponse, new ErrorResponseSerializerV2())
