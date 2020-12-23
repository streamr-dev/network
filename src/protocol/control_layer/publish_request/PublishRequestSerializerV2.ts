import ControlMessage from '../ControlMessage'
import StreamMessage from '../../message_layer/StreamMessage'

import PublishRequest from './PublishRequest'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class PublishRequestSerializerV2 extends Serializer<PublishRequest> {
    toArray(publishRequest: PublishRequest, streamMessageVersion = StreamMessage.LATEST_VERSION) {
        return [
            VERSION,
            ControlMessage.TYPES.PublishRequest,
            publishRequest.requestId,
            StreamMessage.getSerializer(streamMessageVersion).toArray(publishRequest.streamMessage),
            publishRequest.sessionToken,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            serializedStreamMsg,
            sessionToken,
        ] = arr

        return new PublishRequest({
            version,
            requestId,
            streamMessage: StreamMessage.deserialize(serializedStreamMsg),
            sessionToken,
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.PublishRequest, new PublishRequestSerializerV2())
