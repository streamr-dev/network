import ControlMessage from '../ControlMessage'

import SubscribeRequest from './SubscribeRequest'

const VERSION = 1

export default class SubscribeRequestSerializerV1 {
    static toArray(subscribeRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.SubscribeRequest,
            subscribeRequest.streamId,
            subscribeRequest.streamPartition,
            subscribeRequest.sessionToken,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            streamId,
            streamPartition,
            sessionToken,
        ] = arr

        return new SubscribeRequest({
            version, streamId, streamPartition, sessionToken
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.SubscribeRequest, SubscribeRequestSerializerV1)
