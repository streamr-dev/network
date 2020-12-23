import ControlMessage, { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../ControlMessage'
import StreamMessage from '../../message_layer/StreamMessage'

import BroadcastMessage from './BroadcastMessage'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class BroadcastMessageSerializerV1 extends Serializer<BroadcastMessage> {
    toArray(broadcastMessage: BroadcastMessage, streamMessageVersion = StreamMessage.LATEST_VERSION) {
        return [
            VERSION,
            ControlMessage.TYPES.BroadcastMessage,
            StreamMessage.getSerializer(streamMessageVersion).toArray(broadcastMessage.streamMessage),
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            serializedStreamMsg
        ] = arr

        return new BroadcastMessage({
            version,
            streamMessage: StreamMessage.deserialize(serializedStreamMsg),
            requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.BroadcastMessage, new BroadcastMessageSerializerV1())
