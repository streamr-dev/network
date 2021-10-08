import ControlMessage from '../ControlMessage'

import ResendLastRequest from './ResendLastRequest'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class ResendLastRequestSerializerV2 extends Serializer<ResendLastRequest> {
    toArray(resendLastRequest: ResendLastRequest): any[] {
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

    fromArray(arr: any[]): ResendLastRequest {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
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
