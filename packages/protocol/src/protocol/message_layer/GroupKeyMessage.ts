import { validateIsString } from '../../utils/validations'
import MessageID from './MessageID'
import MessageRef from './MessageRef'

import StreamMessage, { StreamMessageType } from './StreamMessage'

// TODO refactor deserialization to separate class (Serializer<GroupKeyMessage>)

export default abstract class GroupKeyMessage {
    // messageType -> class mapping
    static classByMessageType: {
        [key: number]: Omit<typeof GroupKeyMessage, 'new'> // remove new, don't care about how to construct since we have from/to methods
    } = {}

    streamId: string
    messageType: StreamMessageType

    constructor(streamId: string, messageType: StreamMessageType) {
        validateIsString('streamId', streamId)
        this.streamId = streamId

        StreamMessage.validateMessageType(messageType)
        this.messageType = messageType
    }

    serialize(): string {
        return JSON.stringify(this.toArray())
    }

    static deserialize(serialized: string, messageType: StreamMessageType): GroupKeyMessage {
        if (!GroupKeyMessage.classByMessageType[messageType]) {
            throw new Error(`Unknown MessageType: ${messageType}`)
        }
        return GroupKeyMessage.classByMessageType[messageType].fromArray(JSON.parse(serialized))
    }

    static fromStreamMessage(streamMessage: StreamMessage): GroupKeyMessage {
        return GroupKeyMessage.deserialize(streamMessage.getSerializedContent()!, streamMessage.messageType)
    }

    toStreamMessage(messageId: MessageID, prevMsgRef: MessageRef | null): StreamMessage {
        return new StreamMessage({
            messageId,
            prevMsgRef,
            content: this.serialize(),
            messageType: this.messageType,
        })
    }

    abstract toArray(): any[]

    static fromArray(_arr: any[]): GroupKeyMessage {
        // typescript doesn't support abstract static so have to do this
        throw new Error('must be overridden')
    }
}
