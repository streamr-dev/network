import ControlMessage from '../ControlMessage'

import ProxyPublishStreamConnectionResponse from "./ProxyPublishStreamConnectionResponse"
import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

export default class ProxyPublishStreamConnectionResponseSerializerV2 extends Serializer<ProxyPublishStreamConnectionResponse> {
    toArray(publishStreamConnectionResponse: ProxyPublishStreamConnectionResponse): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.ProxyPublishStreamConnectionResponse,
            publishStreamConnectionResponse.requestId,
            publishStreamConnectionResponse.streamId,
            publishStreamConnectionResponse.streamPartition,
            publishStreamConnectionResponse.senderId,
            publishStreamConnectionResponse.accepted
        ]
    }

    fromArray(arr: any[]): ProxyPublishStreamConnectionResponse {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            senderId,
            accepted
        ] = arr

        return new ProxyPublishStreamConnectionResponse({
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
    ControlMessage.TYPES.ProxyPublishStreamConnectionResponse,
    new ProxyPublishStreamConnectionResponseSerializerV2()
)
