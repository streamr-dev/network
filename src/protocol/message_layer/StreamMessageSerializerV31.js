import StreamMessage from './StreamMessage'
import MessageRef from './MessageRef'
import MessageIDStrict from './MessageIDStrict'

const VERSION = 31

export default class StreamMessageSerializerV31 {
    static toArray(streamMessage) {
        return [
            VERSION,
            streamMessage.messageId.toArray(),
            streamMessage.prevMsgRef ? streamMessage.prevMsgRef.toArray() : null,
            streamMessage.contentType,
            streamMessage.encryptionType,
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
            encryptionType,
            serializedContent,
            signatureType,
            signature,
        ] = arr

        return new StreamMessage(
            MessageIDStrict.fromArray(messageIdArr),
            prevMsgRefArr ? MessageRef.fromArray(prevMsgRefArr) : null,
            serializedContent,
            contentType,
            encryptionType,
            signatureType,
            signature,
        )
    }
}

StreamMessage.registerSerializer(VERSION, StreamMessageSerializerV31)
