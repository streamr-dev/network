import StreamMessage from './StreamMessage'
import MessageID from './MessageID'
import MessageRef from './MessageRef'

import { Serializer } from '../../Serializer'

const VERSION = 30

export default class StreamMessageSerializerV30 extends Serializer<StreamMessage> {
    toArray(streamMessage: StreamMessage) {
        return [
            VERSION,
            streamMessage.messageId.toArray(),
            streamMessage.prevMsgRef ? streamMessage.prevMsgRef.toArray() : null,
            streamMessage.messageType,
            streamMessage.serializedContent,
            streamMessage.signatureType,
            streamMessage.signature,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version, // eslint-disable-line no-unused-vars
            messageIdArr,
            prevMsgRefArr,
            messageType,
            serializedContent,
            signatureType,
            signature,
        ] = arr

        return new StreamMessage({
            messageId: MessageID.fromArray(messageIdArr),
            prevMsgRef: prevMsgRefArr ? MessageRef.fromArray(prevMsgRefArr) : null,
            content: serializedContent,
            messageType,
            contentType: StreamMessage.CONTENT_TYPES.JSON,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE, // encryption not supported in V30
            signatureType,
            signature,
        })
    }
}

StreamMessage.registerSerializer(VERSION, new StreamMessageSerializerV30())
