import StreamMessage from './StreamMessage'
import MessageRef from './MessageRef'
import MessageIDStrict from './MessageIDStrict'
import EncryptedGroupKey from './EncryptedGroupKey'

import { Serializer } from '../../Serializer'

const VERSION = 32

export default class StreamMessageSerializerV32 extends Serializer<StreamMessage> {
    toArray(streamMessage: StreamMessage) {
        return [
            VERSION,
            streamMessage.messageId.toArray(),
            streamMessage.prevMsgRef ? streamMessage.prevMsgRef.toArray() : null,
            streamMessage.messageType,
            streamMessage.contentType,
            streamMessage.encryptionType,
            streamMessage.groupKeyId,
            streamMessage.serializedContent,
            streamMessage.newGroupKey ? streamMessage.newGroupKey.serialize() : null,
            streamMessage.signatureType,
            streamMessage.signature,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version, // eslint-disable-line @typescript-eslint/no-unused-vars
            messageIdArr,
            prevMsgRefArr,
            messageType,
            contentType,
            encryptionType,
            groupKeyId,
            serializedContent,
            serializedNewGroupKey,
            signatureType,
            signature,
        ] = arr

        return new StreamMessage({
            messageId: MessageIDStrict.fromArray(messageIdArr),
            prevMsgRef: prevMsgRefArr ? MessageRef.fromArray(prevMsgRefArr) : null,
            content: serializedContent,
            messageType,
            contentType,
            encryptionType,
            groupKeyId,
            newGroupKey: serializedNewGroupKey ? EncryptedGroupKey.deserialize(serializedNewGroupKey) : null,
            signatureType,
            signature,
        })
    }
}

StreamMessage.registerSerializer(VERSION, new StreamMessageSerializerV32())
