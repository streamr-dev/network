import ControlMessage from '../ControlMessage'

import UnsubscribeResponse from './UnsubscribeResponse'

const VERSION = 1

export default class UnsubscribeResponseSerializerV1 {
    static toArray(unsubscribeResponse) {
        return [
            VERSION,
            ControlMessage.TYPES.UnsubscribeResponse,
            unsubscribeResponse.streamId,
            unsubscribeResponse.streamPartition,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            streamId,
            streamPartition,
        ] = arr

        return new UnsubscribeResponse(version, null, streamId, streamPartition)
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.UnsubscribeResponse, UnsubscribeResponseSerializerV1)
