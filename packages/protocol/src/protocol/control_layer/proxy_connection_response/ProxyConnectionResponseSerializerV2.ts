import ControlMessage from '../ControlMessage'

import ProxyConnectionResponse from "./ProxyConnectionResponse"
import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

export default class ProxyConnectionResponseSerializerV2 extends Serializer<ProxyConnectionResponse> {
    toArray(proxyConnectionResponse: ProxyConnectionResponse): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.ProxyConnectionResponse,
            proxyConnectionResponse.requestId,
            proxyConnectionResponse.streamId,
            proxyConnectionResponse.streamPartition,
            proxyConnectionResponse.senderId,
            proxyConnectionResponse.direction,
            proxyConnectionResponse.accepted
        ]
    }

    fromArray(arr: any[]): ProxyConnectionResponse {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            senderId,
            direction,
            accepted,
        ] = arr

        return new ProxyConnectionResponse({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition,
            senderId,
            direction,
            accepted
        })
    }
}

ControlMessage.registerSerializer(
    VERSION,
    ControlMessage.TYPES.ProxyConnectionResponse,
    new ProxyConnectionResponseSerializerV2()
)
