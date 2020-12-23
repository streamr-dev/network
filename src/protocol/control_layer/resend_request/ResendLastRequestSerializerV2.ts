import ControlMessage from '../ControlMessage'

import ResendLastRequest from './ResendLastRequest'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class ResendLastRequestSerializerV2 extends Serializer<ResendLastRequest> {
    toArray(resendLastRequest: ResendLastRequest) {
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

    fromArray(arr: any[]) {
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

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendLastRequest, new ResendLastRequestSerializerV2())
