import ControlMessage from '../ControlMessage'

import ProxySubscribeStreamConnectionRequest from "./ProxySubscribeStreamConnectionRequest"

import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

export default class ProxySubscribeStreamConnectionRequestSerializerV2 extends Serializer<ProxySubscribeStreamConnectionRequest> {
    toArray(subscribeStreamConnectionRequest: ProxySubscribeStreamConnectionRequest): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.ProxySubscribeStreamConnectionRequest,
            subscribeStreamConnectionRequest.requestId,
            subscribeStreamConnectionRequest.streamId,
            subscribeStreamConnectionRequest.streamPartition,
            subscribeStreamConnectionRequest.senderId,
        ]
    }

    fromArray(arr: any[]): ProxySubscribeStreamConnectionRequest {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            senderId,
        ] = arr

        return new ProxySubscribeStreamConnectionRequest({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition,
            senderId,
        })
    }
}

ControlMessage.registerSerializer(VERSION,
    ControlMessage.TYPES.ProxySubscribeStreamConnectionRequest,
    new ProxySubscribeStreamConnectionRequestSerializerV2()
)
