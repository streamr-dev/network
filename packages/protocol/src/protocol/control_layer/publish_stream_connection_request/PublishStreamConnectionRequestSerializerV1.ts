import ControlMessage, { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../ControlMessage'
import StreamMessage from '../../message_layer/StreamMessage'

import PublishStreamConnectionRequest from './PublishStreamConnectionRequest'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class PublishStreamConnectionRequestSerializerV1 extends Serializer<PublishStreamConnectionRequest> {
    toArray(publishStreamConnectionRequest: PublishStreamConnectionRequest, streamMessageVersion = StreamMessage.LATEST_VERSION): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.PublishStreamConnectionRequest,
            publishStreamConnectionRequest.streamId,
            publishStreamConnectionRequest.streamPartition,
            publishStreamConnectionRequest.senderId
        ]
    }

    fromArray(arr: any[]): PublishStreamConnectionRequest {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            streamId,
            streamPartition,
            senderId
        ] = arr

        return new PublishStreamConnectionRequest({
            version,
            streamId,
            streamPartition,
            senderId,
            requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.PublishStreamConnectionRequest, new PublishStreamConnectionRequestSerializerV1())
