import ControlMessage from '../ControlMessage'

import UnsubscribeResponse from './UnsubscribeResponse'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class UnsubscribeResponseSerializerV2 extends Serializer<UnsubscribeResponse> {
    toArray(unsubscribeResponse: UnsubscribeResponse) {
        return [
            VERSION,
            ControlMessage.TYPES.UnsubscribeResponse,
            unsubscribeResponse.requestId,
            unsubscribeResponse.streamId,
            unsubscribeResponse.streamPartition,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            streamId,
            streamPartition,
        ] = arr

        return new UnsubscribeResponse({
            version, requestId, streamId, streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.UnsubscribeResponse, new UnsubscribeResponseSerializerV2())
