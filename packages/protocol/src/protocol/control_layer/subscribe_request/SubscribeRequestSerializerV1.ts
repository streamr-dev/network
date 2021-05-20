import ControlMessage, { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../ControlMessage'

import SubscribeRequest from './SubscribeRequest'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class SubscribeRequestSerializerV1 extends Serializer<SubscribeRequest> {
    toArray(subscribeRequest: SubscribeRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.SubscribeRequest,
            subscribeRequest.streamId,
            subscribeRequest.streamPartition,
            subscribeRequest.sessionToken,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            streamId,
            streamPartition,
            sessionToken,
        ] = arr

        return new SubscribeRequest({
            version, streamId, streamPartition, sessionToken, requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.SubscribeRequest, new SubscribeRequestSerializerV1())
