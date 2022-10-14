import ControlMessage from '../ControlMessage'

import ProxyConnectionRequest from "./ProxyConnectionRequest"

import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

/* eslint-disable class-methods-use-this */
export default class ProxyConnectionRequestSerializerV2 extends Serializer<ProxyConnectionRequest> {
    toArray(proxyConnectionRequest: ProxyConnectionRequest): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.ProxyConnectionRequest,
            proxyConnectionRequest.requestId,
            proxyConnectionRequest.streamId,
            proxyConnectionRequest.streamPartition,
            proxyConnectionRequest.senderId,
            proxyConnectionRequest.direction,
            proxyConnectionRequest.userId
        ]
    }

    fromArray(arr: any[]): ProxyConnectionRequest {
        const [
            version,
            __type,
            requestId,
            streamId,
            streamPartition,
            senderId,
            direction,
            userId
        ] = arr

        return new ProxyConnectionRequest({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition,
            senderId,
            direction,
            userId
        })
    }
}

ControlMessage.registerSerializer(
    VERSION,
    ControlMessage.TYPES.ProxyConnectionRequest,
    new ProxyConnectionRequestSerializerV2()
)
