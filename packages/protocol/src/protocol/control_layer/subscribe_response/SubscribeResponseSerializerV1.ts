import ControlMessage, { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../ControlMessage'

import SubscribeResponse from './SubscribeResponse'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class SubscribeResponseSerializerV1 extends Serializer<SubscribeResponse> {
    toArray(subscribeResponse: SubscribeResponse) {
        return [
            VERSION,
            ControlMessage.TYPES.SubscribeResponse,
            subscribeResponse.streamId,
            subscribeResponse.streamPartition,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            streamId,
            streamPartition,
        ] = arr

        return new SubscribeResponse({
            version, streamId, streamPartition, requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.SubscribeResponse, new SubscribeResponseSerializerV1())
