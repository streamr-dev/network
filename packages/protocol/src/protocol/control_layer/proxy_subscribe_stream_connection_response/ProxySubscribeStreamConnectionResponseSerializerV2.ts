import ControlMessage from '../ControlMessage'

import ProxySubscribeStreamConnectionResponse from "./ProxySubscribeStreamConnectionResponse"
import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

export default class ProxySubscribeStreamConnectionResponseSerializerV2 extends Serializer<ProxySubscribeStreamConnectionResponse> {
    toArray(subscribeStreamConnectionResponse: ProxySubscribeStreamConnectionResponse): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.ProxySubscribeStreamConnectionResponse,
            subscribeStreamConnectionResponse.requestId,
            subscribeStreamConnectionResponse.streamId,
            subscribeStreamConnectionResponse.streamPartition,
            subscribeStreamConnectionResponse.senderId,
            subscribeStreamConnectionResponse.accepted
        ]
    }

    fromArray(arr: any[]): ProxySubscribeStreamConnectionResponse {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            senderId,
            accepted
        ] = arr

        return new ProxySubscribeStreamConnectionResponse({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition,
            senderId,
            accepted
        })
    }
}

ControlMessage.registerSerializer(
    VERSION,
    ControlMessage.TYPES.ProxySubscribeStreamConnectionResponse,
    new ProxySubscribeStreamConnectionResponseSerializerV2()
)
