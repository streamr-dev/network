import ControlMessage, { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../ControlMessage'
import StreamMessage from '../../message_layer/StreamMessage'

import PublishStreamConnectionResponse from './PublishStreamConnectionResponse'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class PublishStreamConnectionResponseSerializerV1 extends Serializer<PublishStreamConnectionResponse> {
    toArray(publishStreamConnectionResponse: PublishStreamConnectionResponse, streamMessageVersion = StreamMessage.LATEST_VERSION): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.PublishRequest,
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
            streamId,
            streamPartition,
            senderId,
            accepted
        ] = arr

        return new PublishStreamConnectionResponse({
            version,
            streamId,
            streamPartition,
            senderId,
            accepted,
            requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.PublishStreamConnectionResponse, new PublishStreamConnectionResponseSerializerV1())
