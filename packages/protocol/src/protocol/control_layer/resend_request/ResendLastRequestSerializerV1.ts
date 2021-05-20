import ControlMessage from '../ControlMessage'

import ResendLastRequest from './ResendLastRequest'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class ResendLastRequestSerializerV1 extends Serializer<ResendLastRequest> {
    toArray(resendLastRequest: ResendLastRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendLastRequest,
            resendLastRequest.streamId,
            resendLastRequest.streamPartition,
            resendLastRequest.requestId,
            resendLastRequest.numberLast,
            resendLastRequest.sessionToken,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            streamId,
            streamPartition,
            requestId,
            numberLast,
            sessionToken,
        ] = arr

        return new ResendLastRequest({
            version, requestId, streamId, streamPartition, numberLast, sessionToken
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendLastRequest, new ResendLastRequestSerializerV1())
