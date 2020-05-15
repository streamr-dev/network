import ControlMessage from '../ControlMessage'

import SubscribeRequest from './SubscribeRequest'

const VERSION = 2

export default class SubscribeRequestSerializerV2 {
    static toArray(subscribeRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.SubscribeRequest,
            subscribeRequest.requestId,
            subscribeRequest.streamId,
            subscribeRequest.streamPartition,
            subscribeRequest.sessionToken,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            streamId,
            streamPartition,
            sessionToken,
        ] = arr

        return new SubscribeRequest(version, requestId, streamId, streamPartition, sessionToken)
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.SubscribeRequest, SubscribeRequestSerializerV2)
