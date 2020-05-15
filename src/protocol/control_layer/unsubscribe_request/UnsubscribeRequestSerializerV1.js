import ControlMessage from '../ControlMessage'

import UnsubscribeRequest from './UnsubscribeRequest'

const VERSION = 1

export default class UnsubscribeRequestSerializerV1 {
    static toArray(unsubscribeRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.UnsubscribeRequest,
            unsubscribeRequest.streamId,
            unsubscribeRequest.streamPartition,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            streamId,
            streamPartition,
        ] = arr

        return new UnsubscribeRequest(version, null, streamId, streamPartition)
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.UnsubscribeRequest, UnsubscribeRequestSerializerV1)
