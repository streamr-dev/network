import TrackerMessage from '../TrackerMessage'

import MulticastMessage from './MulticastMessage'

import { Serializer } from '../../../Serializer'
import StreamMessage from '../../message_layer/StreamMessage'

const VERSION = 2

export default class MulticastMessageSerializerV2 extends Serializer<MulticastMessage> {
    toArray(message: MulticastMessage): any[] {
        return [
            VERSION,
            TrackerMessage.TYPES.MulticastMessage,
            message.requestId,
            message.senderNodeId,
            message.recipientUserId,
            message.payload.serialize()
        ]
    }

    fromArray(arr: any[]): MulticastMessage {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            senderNodeId,
            recipientNodeId,
            payload
        ] = arr

        return new MulticastMessage({
            version, requestId, senderNodeId, recipientUserId: recipientNodeId, payload: StreamMessage.deserialize(payload)
        })
    }
}

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.MulticastMessage, new MulticastMessageSerializerV2())
