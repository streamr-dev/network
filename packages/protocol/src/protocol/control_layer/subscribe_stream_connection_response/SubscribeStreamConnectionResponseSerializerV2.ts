import ControlMessage from '../ControlMessage'

import SubscribeStreamConnectionResponse from "./SubscribeStreamConnectionResponse"
import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

export default class SubscribeStreamConnectionResponseSerializerV2 extends Serializer<SubscribeStreamConnectionResponse> {
    toArray(subscribeStreamConnectionResponse: SubscribeStreamConnectionResponse): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.SubscribeStreamConnectionResponse,
            subscribeStreamConnectionResponse.requestId,
            subscribeStreamConnectionResponse.streamId,
            subscribeStreamConnectionResponse.streamPartition,
            subscribeStreamConnectionResponse.senderId,
            subscribeStreamConnectionResponse.accepted
        ]
    }

    fromArray(arr: any[]): SubscribeStreamConnectionResponse {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            senderId,
            accepted
        ] = arr

        return new SubscribeStreamConnectionResponse({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition,
            senderId,
            accepted
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.SubscribeStreamConnectionResponse, new SubscribeStreamConnectionResponseSerializerV2())
