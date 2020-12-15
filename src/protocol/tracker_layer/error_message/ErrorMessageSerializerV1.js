import TrackerMessage from '../TrackerMessage'

import ErrorMessage from './ErrorMessage'

const VERSION = 1

export default class ErrorMessageSerializerV1 {
    static toArray(errorMessage) {
        return [
            VERSION,
            TrackerMessage.TYPES.ErrorMessage,
            errorMessage.requestId,
            errorMessage.errorCode,
            errorMessage.targetNode,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            errorCode,
            targetNode
        ] = arr

        return new ErrorMessage({
            version, requestId, errorCode, targetNode
        })
    }
}

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.ErrorMessage, ErrorMessageSerializerV1)
