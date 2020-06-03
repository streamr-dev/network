import ControlMessage from '../ControlMessage'
import StreamMessage from '../../message_layer/StreamMessage'

import BroadcastMessage from './BroadcastMessage'

const VERSION = 1

export default class BroadcastMessageSerializerV1 {
    static toArray(broadcastMessage, streamMessageVersion = StreamMessage.LATEST_VERSION) {
        return [
            VERSION,
            ControlMessage.TYPES.BroadcastMessage,
            StreamMessage.getSerializer(streamMessageVersion).toArray(broadcastMessage.streamMessage),
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            serializedStreamMsg
        ] = arr

        return new BroadcastMessage({
            version,
            streamMessage: StreamMessage.deserialize(serializedStreamMsg),
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.BroadcastMessage, BroadcastMessageSerializerV1)
