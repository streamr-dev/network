import { validateIsString } from '../../utils/validations'

import StreamMessage from './StreamMessage'

export default class GroupKeyMessage {
    constructor(streamId, messageType) {
        validateIsString('streamId', streamId)
        this.streamId = streamId

        StreamMessage.validateMessageType(messageType)
        this.messageType = messageType
    }

    serialize() {
        return JSON.stringify(this.toArray())
    }

    static deserialize(serialized, messageType) {
        if (!GroupKeyMessage.classByMessageType[messageType]) {
            throw new Error(`Unknown MessageType: ${messageType}`)
        }
        return GroupKeyMessage.classByMessageType[messageType].fromArray(JSON.parse(serialized))
    }

    static fromStreamMessage(streamMessage) {
        return GroupKeyMessage.deserialize(streamMessage.getSerializedContent(), streamMessage.messageType)
    }

    toStreamMessage(messageId, prevMsgRef) {
        return new StreamMessage({
            messageId,
            prevMsgRef,
            content: this.serialize(),
            messageType: this.messageType,
        })
    }
}

GroupKeyMessage.classByMessageType = {}
