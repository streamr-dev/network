import {
    MessageID as OldMessageID,
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
    GroupKey,
    EncryptionType,
    GroupKeyRequest,
    GroupKeyResponse,
    MessageRef,
    StreamMessage,
    StreamMessageType,
    MessageID
} from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { toEthereumAddress } from '@streamr/utils'
import { GroupKeyRequestTranslator } from './GroupKeyRequestTranslator'
import { GroupKeyResponseTranslator } from './GroupKeyResponseTranslator'
import { binaryToHex, binaryToUtf8, hexToBinary, utf8ToBinary } from '../../utils'

const oldToNewEncryptionType = (type: OldEncryptionType): EncryptionType => {
    if (type === OldEncryptionType.AES) {
        return EncryptionType.AES
    }
    return EncryptionType.NONE
}

const newToOldEncryptionType = (type: EncryptionType): OldEncryptionType => {
    if (type === EncryptionType.AES) {
        return OldEncryptionType.AES
    }
    return OldEncryptionType.NONE
}

const oldToNewContentType = (_type: OldContentType): ContentType => {
    return ContentType.JSON
}

const newToOldContentType = (_type: ContentType): OldContentType => {
    return OldContentType.JSON
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StreamMessageTranslator {

    static toProtobuf(msg: OldStreamMessage): StreamMessage {
        let content: Uint8Array
        let messageType: StreamMessageType
        const contentType = msg.contentType
        if (msg.messageType === OldStreamMessageType.MESSAGE) {
            content = utf8ToBinary(msg.serializedContent)
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
        const messageId: MessageID = {
            timestamp: msg.getTimestamp(),
            sequenceNumber: msg.getSequenceNumber(),
            streamId: msg.getStreamId() as string,
            streamPartition: msg.getStreamPartition(),
            publisherId: hexToBinary(msg.getPublisherId()),
            messageChainId: msg.getMsgChainId()
        }
        let previousMessageRef: MessageRef | undefined = undefined
        if (msg.getPreviousMessageRef()) {
            previousMessageRef = {
                timestamp: msg.getPreviousMessageRef()!.timestamp,
                sequenceNumber: msg.getPreviousMessageRef()!.sequenceNumber,
            }
        }
        let newGroupKey: GroupKey | undefined = undefined
        if (msg.getNewGroupKey()) {
            newGroupKey = {
                data: hexToBinary(msg.getNewGroupKey()!.encryptedGroupKeyHex),
                id: msg.getNewGroupKey()!.groupKeyId
            }
        }
        const translated: StreamMessage = {
            content,
            contentType: oldToNewContentType(contentType),
            encryptionType: oldToNewEncryptionType(msg.encryptionType),
            messageId,
            previousMessageRef,
            messageType,
            signature: hexToBinary(msg.signature),
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
            content = binaryToUtf8(msg.content)
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_REQUEST) {
            messageType = OldStreamMessageType.GROUP_KEY_REQUEST
            content = GroupKeyRequestTranslator.toClientProtocol(GroupKeyRequest.fromBinary(msg.content)).serialize()
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_RESPONSE) {
            messageType = OldStreamMessageType.GROUP_KEY_RESPONSE
            content = GroupKeyResponseTranslator.toClientProtocol(GroupKeyResponse.fromBinary(msg.content)).serialize()
        } else {
            throw new Error('invalid message type')
        }
        const messageId = new OldMessageID(
            msg.messageId!.streamId as StreamID,
            msg.messageId!.streamPartition,
            Number(msg.messageId!.timestamp),
            msg.messageId!.sequenceNumber,
            toEthereumAddress(binaryToHex(msg.messageId!.publisherId, true)),
            msg.messageId!.messageChainId
        )
        let prevMsgRef: OldMessageRef | undefined = undefined
        if (msg.previousMessageRef) {
            prevMsgRef = new OldMessageRef(Number(msg.previousMessageRef!.timestamp), msg.previousMessageRef!.sequenceNumber)
        }
        let newGroupKey: OldEncryptedGroupKey | undefined = undefined
        if (msg.newGroupKey) {
            newGroupKey = new OldEncryptedGroupKey(
                msg.newGroupKey!.id,
                binaryToHex(msg.newGroupKey!.data),
            )
        }
        const translated = new OldStreamMessage<T>({
            signature: binaryToHex(msg.signature),
            newGroupKey,
            groupKeyId: msg.groupKeyId,
            content,
            contentType: newToOldContentType(contentType),
            messageType,
            encryptionType: newToOldEncryptionType(msg.encryptionType),
            messageId,
            prevMsgRef
        })
        return translated
    }
}
