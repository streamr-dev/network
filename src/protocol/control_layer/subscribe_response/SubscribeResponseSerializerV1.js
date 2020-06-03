import ControlMessage from '../ControlMessage'

import SubscribeResponse from './SubscribeResponse'

const VERSION = 1

export default class SubscribeResponseSerializerV1 {
    static toArray(subscribeResponse) {
        return [
            VERSION,
            ControlMessage.TYPES.SubscribeResponse,
            subscribeResponse.streamId,
            subscribeResponse.streamPartition,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            streamId,
            streamPartition,
        ] = arr

        return new SubscribeResponse({
            version, streamId, streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.SubscribeResponse, SubscribeResponseSerializerV1)
