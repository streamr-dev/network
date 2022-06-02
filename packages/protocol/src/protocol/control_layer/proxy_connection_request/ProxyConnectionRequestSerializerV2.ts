import ControlMessage from '../ControlMessage'

import ProxyConnectionRequest from "./ProxyConnectionRequest"

import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

export default class ProxyConnectionRequestSerializerV2 extends Serializer<ProxyConnectionRequest> {
    toArray(proxyConnectionRequest: ProxyConnectionRequest): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.ProxyConnectionRequest,
            proxyConnectionRequest.requestId,
            proxyConnectionRequest.streamId,
            proxyConnectionRequest.streamPartition,
            proxyConnectionRequest.senderId,
            proxyConnectionRequest.direction
        ]
    }

    fromArray(arr: any[]): ProxyConnectionRequest {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            senderId,
            direction,
        ] = arr

        return new ProxyConnectionRequest({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition,
            senderId,
            direction,
        })
    }
}

ControlMessage.registerSerializer(
    VERSION,
    ControlMessage.TYPES.ProxyConnectionRequest,
    new ProxyConnectionRequestSerializerV2()
)
