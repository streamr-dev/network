import ControlMessage from '../ControlMessage'
import StreamMessage from '../../message_layer/StreamMessage'

import UnicastMessage from './UnicastMessage'

const VERSION = 2

export default class UnicastMessageSerializerV2 {
    static toArray(unicastMessage, streamMessageVersion = StreamMessage.LATEST_VERSION) {
        return [
            VERSION,
            ControlMessage.TYPES.UnicastMessage,
            unicastMessage.requestId,
            StreamMessage.getSerializer(streamMessageVersion).toArray(unicastMessage.streamMessage),
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            serializedStreamMsg
        ] = arr

        return new UnicastMessage({
            version, requestId, streamMessage: StreamMessage.deserialize(serializedStreamMsg)
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.UnicastMessage, UnicastMessageSerializerV2)
