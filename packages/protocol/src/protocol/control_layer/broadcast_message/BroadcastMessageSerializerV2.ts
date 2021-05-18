import ControlMessage from '../ControlMessage'
import StreamMessage from '../../message_layer/StreamMessage'

import BroadcastMessage from './BroadcastMessage'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class BroadcastMessageSerializerV2 extends Serializer<BroadcastMessage> {
    toArray(broadcastMessage: BroadcastMessage, streamMessageVersion = StreamMessage.LATEST_VERSION) {
        return [
            VERSION,
            ControlMessage.TYPES.BroadcastMessage,
            broadcastMessage.requestId,
            StreamMessage.getSerializer(streamMessageVersion).toArray(broadcastMessage.streamMessage),
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            serializedStreamMsg,
        ] = arr

        return new BroadcastMessage({
            version,
            requestId,
            streamMessage: StreamMessage.deserialize(serializedStreamMsg),
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.BroadcastMessage, new BroadcastMessageSerializerV2())
