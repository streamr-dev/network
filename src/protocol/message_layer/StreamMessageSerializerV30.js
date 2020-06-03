import StreamMessage from './StreamMessage'
import MessageID from './MessageID'
import MessageRef from './MessageRef'

const VERSION = 30

export default class StreamMessageSerializerV30 {
    static toArray(streamMessage) {
        return [
            VERSION,
            streamMessage.messageId.toArray(),
            streamMessage.prevMsgRef ? streamMessage.prevMsgRef.toArray() : null,
            streamMessage.contentType,
            streamMessage.serializedContent,
            streamMessage.signatureType,
            streamMessage.signature,
        ]
    }

    static fromArray(arr) {
        const [
            version, // eslint-disable-line no-unused-vars
            messageIdArr,
            prevMsgRefArr,
            contentType,
            serializedContent,
            signatureType,
            signature,
        ] = arr

        return new StreamMessage({
            messageId: MessageID.fromArray(messageIdArr),
            prevMsgRef: prevMsgRefArr ? MessageRef.fromArray(prevMsgRefArr) : null,
            content: serializedContent,
            contentType,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE, // encryption not supported in V30
            signatureType,
            signature,
        })
    }
}

StreamMessage.registerSerializer(VERSION, StreamMessageSerializerV30)
