import { GroupKeyRequest } from '.'
import { validateIsString } from '../../utils/validations'
import MessageID from './MessageID'
import MessageRef from './MessageRef'

import StreamMessage, { StreamMessageType } from './StreamMessage'

// TODO refactor deserialization to separate class (Serializer<GroupKeyMessage>)

export default abstract class GroupKeyMessage {

    static classByMessageType: { [key: number]: { fromArray: (args: any[]) => GroupKeyMessage } } = {}

    streamId: string
    messageType: StreamMessageType

    constructor(streamId: string, messageType: StreamMessageType) {
        validateIsString('streamId', streamId)
        this.streamId = streamId

        StreamMessage.validateMessageType(messageType)
        this.messageType = messageType
    }

    serialize() {
        return JSON.stringify(this.toArray())
    }

    static deserialize(serialized: string, messageType: StreamMessageType) {
        if (!GroupKeyMessage.classByMessageType[messageType]) {
            throw new Error(`Unknown MessageType: ${messageType}`)
        }
        return GroupKeyMessage.classByMessageType[messageType].fromArray(JSON.parse(serialized))
    }

    static fromStreamMessage(streamMessage: StreamMessage) {
        return GroupKeyMessage.deserialize(streamMessage.getSerializedContent()!, streamMessage.messageType)
    }

    toStreamMessage(messageId: MessageID, prevMsgRef: MessageRef | null) {
        return new StreamMessage({
            messageId,
            prevMsgRef,
            content: this.serialize(),
            messageType: this.messageType,
        })
    }

    abstract toArray(): any[]
}
