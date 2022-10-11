import StreamMessage from './StreamMessage'
import MessageRef from './MessageRef'
import MessageID from './MessageID'
import EncryptedGroupKey from './EncryptedGroupKey'

import { Serializer } from '../../Serializer'
import ValidationError from '../../errors/ValidationError'

const VERSION = 32
const SIGNATURE_TYPE_ETH = 2

/* eslint-disable class-methods-use-this */
export default class StreamMessageSerializerV32 extends Serializer<StreamMessage> {
    toArray(streamMessage: StreamMessage): any[] {
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

    fromArray(arr: any[]): StreamMessage<any> {
        const [
            _version,
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

        if (signatureType !== SIGNATURE_TYPE_ETH) {
            throw new ValidationError(`Unsupported signature type: ${signatureType}`)
        }

        return new StreamMessage({
            messageId: MessageID.fromArray(messageIdArr),
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
