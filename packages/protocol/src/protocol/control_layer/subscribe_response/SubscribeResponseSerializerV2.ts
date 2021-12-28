import ControlMessage from '../ControlMessage'

import SubscribeResponse from './SubscribeResponse'

import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../utils/StreamID'

const VERSION = 2

export default class SubscribeResponseSerializerV2 extends Serializer<SubscribeResponse> {
    toArray(subscribeResponse: SubscribeResponse): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.SubscribeResponse,
            subscribeResponse.requestId,
            subscribeResponse.streamId,
            subscribeResponse.streamPartition,
        ]
    }

    fromArray(arr: any[]): SubscribeResponse {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
        ] = arr

        return new SubscribeResponse({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.SubscribeResponse, new SubscribeResponseSerializerV2())
