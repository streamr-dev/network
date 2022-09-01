import TrackerMessage from '../TrackerMessage'

import UnicastMessage from './UnicastMessage'

import { Serializer } from '../../../Serializer'
import StreamMessage from '../../message_layer/StreamMessage'

const VERSION = 2

export default class UnicastMessageSerializerV2 extends Serializer<UnicastMessage> {
    toArray(message: UnicastMessage): any[] {
        return [
            VERSION,
            TrackerMessage.TYPES.UnicastMessage,
            message.requestId,
            message.senderNodeId,
            message.recipientNodeId,
            message.payload.serialize()
        ]
    }

    fromArray(arr: any[]): UnicastMessage {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            senderNodeId,
            recipientNodeId,
            payload
        ] = arr

        return new UnicastMessage({
            version, requestId, senderNodeId, recipientNodeId, payload: StreamMessage.deserialize(payload)
        })
    }
}

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.UnicastMessage, new UnicastMessageSerializerV2())
