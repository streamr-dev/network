import {
    MessageID,
    StreamMessage as OldStreamMessage,
    StreamMessageType as OldStreamMessageType,
    MessageRef as OldMessageRef,
    EncryptedGroupKey as OldEncryptedGroupKey,
    GroupKeyRequest as OldGroupKeyRequest,
    GroupKeyResponse as OldGroupKeyResponse,
    StreamID,
    EncryptionType as OldEncryptionType,
    ContentType as OldContentType
} from '@streamr/protocol'
import {
    ContentType,
    EncryptedGroupKey,
    EncryptionType,
    GroupKeyRequest,
    GroupKeyResponse,
    MessageRef,
    StreamMessage,
    StreamMessageType
} from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { EthereumAddress } from '@streamr/utils'
import { GroupKeyRequestTranslator } from './GroupKeyRequestTranslator'
import { GroupKeyResponseTranslator } from './GroupKeyResponseTranslator'
import { BinaryTranslator } from '../../utils'

const oldEnryptionTypeTranslator = (type: OldEncryptionType): EncryptionType => {
    if (type === OldEncryptionType.AES) {
        return EncryptionType.AES
    }
    return EncryptionType.NONE
}

const newEncryptionTypeTranslator = (type: EncryptionType): OldEncryptionType => {
    if (type === EncryptionType.AES) {
        return OldEncryptionType.AES
    }
    return OldEncryptionType.NONE
}

const oldContentTypeTranslator = (type: OldContentType): ContentType => {
    if (type === OldContentType.JSON) {
        return ContentType.JSON
    }
    // else if (OldContentType.BINARY) {
    //     return ContentType.BINARY
    // }
    return ContentType.JSON
}

const newContentTypeTranslator = (type: ContentType): OldContentType => {
    if (type === ContentType.JSON) {
        return OldContentType.JSON
    }
    // else if (ContentType.BINARY) {
    //     return OldContentType.BINARY
    // }
    return OldContentType.JSON
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StreamMessageTranslator {

    static toProtobuf(msg: OldStreamMessage): StreamMessage {
        let content: Uint8Array
        let messageType: StreamMessageType
        const contentType = msg.contentType
        if (msg.messageType === OldStreamMessageType.MESSAGE) {
            content = BinaryTranslator.toBinary(msg.serializedContent)
            messageType = StreamMessageType.MESSAGE
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_REQUEST) {
            content = GroupKeyRequest.toBinary(
                GroupKeyRequestTranslator.toProtobuf(
                    OldGroupKeyRequest.deserialize(
                        msg.serializedContent,
                        OldStreamMessageType.GROUP_KEY_REQUEST) as OldGroupKeyRequest
                )
            )
            messageType = StreamMessageType.GROUP_KEY_REQUEST
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_RESPONSE) {
            content = GroupKeyResponse.toBinary(
                GroupKeyResponseTranslator.toProtobuf(
                    OldGroupKeyResponse.deserialize(
                        msg.serializedContent,
                        OldStreamMessageType.GROUP_KEY_RESPONSE) as OldGroupKeyResponse
                )
            )
            messageType = StreamMessageType.GROUP_KEY_RESPONSE
        } else {
            throw new Error('invalid message type')
        }
        const messageRef: MessageRef = {
            timestamp: msg.getTimestamp(),
            sequenceNumber: msg.getSequenceNumber(),
            streamId: msg.getStreamId() as string,
            streamPartition: msg.getStreamPartition(),
            publisherId: BinaryTranslator.toBinary(msg.getPublisherId()),
            messageChainId: msg.getMsgChainId()
        }
        let previousMessageRef: MessageRef | undefined = undefined
        if (msg.getPreviousMessageRef()) {
            previousMessageRef = {
                timestamp: msg.getPreviousMessageRef()!.timestamp,
                sequenceNumber: msg.getPreviousMessageRef()!.sequenceNumber,
                streamId: msg.getStreamId() as string,
                streamPartition: msg.getStreamPartition(),
                publisherId: BinaryTranslator.toBinary(msg.getPublisherId()),
                messageChainId: msg.getMsgChainId()
            }
        }
        let newGroupKey: EncryptedGroupKey | undefined = undefined
        if (msg.getNewGroupKey()) {
            newGroupKey = {
                data: BinaryTranslator.toBinary(msg.getNewGroupKey()!.encryptedGroupKeyHex),
                groupKeyId: msg.getNewGroupKey()!.groupKeyId
            }
        }
        const translated: StreamMessage = {
            content,
            contentType: oldContentTypeTranslator(contentType),
            encryptionType: oldEnryptionTypeTranslator(msg.encryptionType),
            messageRef: messageRef,
            previousMessageRef,
            messageType,
            signature: BinaryTranslator.toBinary(msg.signature),
            groupKeyId: msg.groupKeyId ?? undefined,
            newGroupKey,
        }
        return translated
    }

    static toClientProtocol<T>(msg: StreamMessage): OldStreamMessage<T> {
        let content: string
        const contentType = msg.contentType
        let messageType: OldStreamMessageType
        if (msg.messageType === StreamMessageType.MESSAGE) {
            messageType = OldStreamMessageType.MESSAGE
            content = BinaryTranslator.toUTF8(msg.content)
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_REQUEST) {
            messageType = OldStreamMessageType.GROUP_KEY_REQUEST
            content = GroupKeyRequestTranslator.toClientProtocol(GroupKeyRequest.fromBinary(msg.content)).serialize()
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_RESPONSE) {
            messageType = OldStreamMessageType.GROUP_KEY_RESPONSE
            content = GroupKeyResponseTranslator.toClientProtocol(GroupKeyResponse.fromBinary(msg.content)).serialize()
        } else {
            throw new Error('invalid message type')
        }
        const messageId = new MessageID(
            msg.messageRef!.streamId as StreamID,
            msg.messageRef!.streamPartition,
            Number(msg.messageRef!.timestamp),
            msg.messageRef!.sequenceNumber,
            BinaryTranslator.toUTF8(msg.messageRef!.publisherId) as EthereumAddress,
            msg.messageRef!.messageChainId
        )
        let prevMsgRef: OldMessageRef | undefined = undefined
        if (msg.previousMessageRef) {
            prevMsgRef = new OldMessageRef(Number(msg.previousMessageRef!.timestamp), msg.previousMessageRef!.sequenceNumber)
        }
        let newGroupKey: OldEncryptedGroupKey | undefined = undefined
        if (msg.newGroupKey) {
            newGroupKey = new OldEncryptedGroupKey(
                msg.newGroupKey!.groupKeyId,
                BinaryTranslator.toUTF8(msg.newGroupKey!.data),
            )
        }
        const translated = new OldStreamMessage<T>({
            signature: BinaryTranslator.toUTF8(msg.signature),
            newGroupKey,
            groupKeyId: msg.groupKeyId,
            content,
            contentType: newContentTypeTranslator(contentType),
            messageType,
            encryptionType: newEncryptionTypeTranslator(msg.encryptionType),
            messageId,
            prevMsgRef
        })
        return translated
    }
}
