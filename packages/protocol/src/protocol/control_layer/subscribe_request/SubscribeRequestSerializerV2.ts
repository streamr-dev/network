import ControlMessage from '../ControlMessage'

import SubscribeRequest from './SubscribeRequest'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class SubscribeRequestSerializerV2 extends Serializer<SubscribeRequest> {
    toArray(subscribeRequest: SubscribeRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.SubscribeRequest,
            subscribeRequest.requestId,
            subscribeRequest.streamId,
            subscribeRequest.streamPartition,
            subscribeRequest.sessionToken,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            streamId,
            streamPartition,
            sessionToken,
        ] = arr

        return new SubscribeRequest({
            version, requestId, streamId, streamPartition, sessionToken
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.SubscribeRequest, new SubscribeRequestSerializerV2())
