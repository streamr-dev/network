import ControlMessage from '../ControlMessage'

import ProxyPublishStreamConnectionRequest from "./ProxyPublishStreamConnectionRequest"

import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

export default class ProxyPublishStreamConnectionRequestSerializerV2 extends Serializer<ProxyPublishStreamConnectionRequest> {
    toArray(publishStreamConnectionRequest: ProxyPublishStreamConnectionRequest): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.ProxyPublishStreamConnectionRequest,
            publishStreamConnectionRequest.requestId,
            publishStreamConnectionRequest.streamId,
            publishStreamConnectionRequest.streamPartition,
            publishStreamConnectionRequest.senderId,
        ]
    }

    fromArray(arr: any[]): ProxyPublishStreamConnectionRequest {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            senderId,
        ] = arr

        return new ProxyPublishStreamConnectionRequest({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition,
            senderId,
        })
    }
}

ControlMessage.registerSerializer(
    VERSION,
    ControlMessage.TYPES.ProxyPublishStreamConnectionRequest,
    new ProxyPublishStreamConnectionRequestSerializerV2()
)
