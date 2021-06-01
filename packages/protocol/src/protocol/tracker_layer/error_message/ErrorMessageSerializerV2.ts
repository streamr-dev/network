import TrackerMessage from '../TrackerMessage'

import ErrorMessage from './ErrorMessage'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class ErrorMessageSerializerV2 extends Serializer<ErrorMessage> {
    toArray(errorMessage: ErrorMessage) {
        return [
            VERSION,
            TrackerMessage.TYPES.ErrorMessage,
            errorMessage.requestId,
            errorMessage.errorCode,
            errorMessage.targetNode,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            errorCode,
            targetNode
        ] = arr

        return new ErrorMessage({
            version, requestId, errorCode, targetNode
        })
    }
}

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.ErrorMessage, new ErrorMessageSerializerV2())
