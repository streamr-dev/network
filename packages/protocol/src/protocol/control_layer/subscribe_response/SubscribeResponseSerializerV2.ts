import ControlMessage from '../ControlMessage'

import SubscribeResponse from './SubscribeResponse'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class SubscribeResponseSerializerV2 extends Serializer<SubscribeResponse> {
    toArray(subscribeResponse: SubscribeResponse) {
        return [
            VERSION,
            ControlMessage.TYPES.SubscribeResponse,
            subscribeResponse.requestId,
            subscribeResponse.streamId,
            subscribeResponse.streamPartition,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
        ] = arr

        return new SubscribeResponse({
            version, requestId, streamId, streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.SubscribeResponse, new SubscribeResponseSerializerV2())
