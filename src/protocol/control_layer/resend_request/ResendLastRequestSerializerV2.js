import ControlMessage from '../ControlMessage'

import ResendLastRequest from './ResendLastRequest'

const VERSION = 2

export default class ResendLastRequestSerializerV2 {
    static toArray(resendLastRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendLastRequest,
            resendLastRequest.requestId,
            resendLastRequest.streamId,
            resendLastRequest.streamPartition,
            resendLastRequest.numberLast,
            resendLastRequest.sessionToken,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            streamId,
            streamPartition,
            numberLast,
            sessionToken,
        ] = arr

        return new ResendLastRequest({
            version, requestId, streamId, streamPartition, numberLast, sessionToken
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendLastRequest, ResendLastRequestSerializerV2)
