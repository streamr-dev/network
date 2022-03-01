import ControlMessage from '../ControlMessage'

import SubscribeStreamConnectionRequest from "./SubscribeStreamConnectionRequest"

import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

export default class SubscribeStreamConnectionRequestSerializerV2 extends Serializer<SubscribeStreamConnectionRequest> {
    toArray(subscribeStreamConnectionRequest: SubscribeStreamConnectionRequest): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.SubscribeStreamConnectionRequest,
            subscribeStreamConnectionRequest.requestId,
            subscribeStreamConnectionRequest.streamId,
            subscribeStreamConnectionRequest.streamPartition,
            subscribeStreamConnectionRequest.senderId,
        ]
    }

    fromArray(arr: any[]): SubscribeStreamConnectionRequest {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            senderId,
        ] = arr

        return new SubscribeStreamConnectionRequest({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition,
            senderId,
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.SubscribeStreamConnectionRequest, new SubscribeStreamConnectionRequestSerializerV2())
