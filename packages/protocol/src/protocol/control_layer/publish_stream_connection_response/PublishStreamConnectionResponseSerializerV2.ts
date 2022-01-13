import ControlMessage from '../ControlMessage'

import PublishStreamConnectionResponse from "./PublishStreamConnectionResponse"
import { Serializer } from '../../../Serializer'
import { StreamIDUtils } from '../../../utils/StreamID'

const VERSION = 2

export default class PublishStreamConnectionResponseSerializerV2 extends Serializer<PublishStreamConnectionResponse> {
    toArray(publishStreamConnectionResponse: PublishStreamConnectionResponse): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.PublishStreamConnectionResponse,
            publishStreamConnectionResponse.requestId,
            publishStreamConnectionResponse.streamId,
            publishStreamConnectionResponse.streamPartition,
            publishStreamConnectionResponse.senderId,
            publishStreamConnectionResponse.accepted
        ]
    }

    fromArray(arr: any[]): PublishStreamConnectionResponse {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            senderId,
            accepted
        ] = arr

        return new PublishStreamConnectionResponse({
            version,
            requestId,
            streamId: StreamIDUtils.toStreamID(streamId),
            streamPartition,
            senderId,
            accepted
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.PublishStreamConnectionResponse, new PublishStreamConnectionResponseSerializerV2())
