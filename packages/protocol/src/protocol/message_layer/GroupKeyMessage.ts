import { validateIsString } from '../../utils/validations'
import ValidationError from '../../errors/ValidationError'
import StreamMessage, { StreamMessageType } from './StreamMessage'
import { StreamID } from '../../utils/StreamID'

// TODO refactor deserialization to separate class (Serializer<GroupKeyMessage>)
//
type GroupKeyMessageType = Omit<typeof GroupKeyMessage, 'new'> // remove new, don't care about how to construct since we have from/to methods

export default abstract class GroupKeyMessage {
    // messageType -> class mapping
    static classByMessageType: {
        [key: number]: GroupKeyMessageType
    } = {}

    streamId: StreamID
    messageType: StreamMessageType

    protected constructor(streamId: StreamID, messageType: StreamMessageType) {
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
            throw new ValidationError(`Unknown MessageType: ${messageType}`)
        }
        return GroupKeyMessage.classByMessageType[messageType].fromArray(JSON.parse(serialized))
    }

    static fromStreamMessage(streamMessage: StreamMessage): GroupKeyMessage {
        return GroupKeyMessage.deserialize(streamMessage.getSerializedContent()!, streamMessage.messageType)
    }

    abstract toArray(): any[]

    static fromArray(_arr: any[]): GroupKeyMessage {
        // typescript doesn't support abstract static so have to do this
        throw new Error('must be overridden')
    }
}
