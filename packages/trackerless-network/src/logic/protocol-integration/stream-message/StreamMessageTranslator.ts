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
import { toEthereumAddress, binaryToHex, binaryToUtf8, hexToBinary, utf8ToBinary } from '@streamr/utils'
import { GroupKeyRequestTranslator } from './GroupKeyRequestTranslator'
import { GroupKeyResponseTranslator } from './GroupKeyResponseTranslator'

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

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StreamMessageTranslator {

    static toProtobuf(msg: OldStreamMessage): StreamMessage {
        let content: Uint8Array
        let messageType: StreamMessageType
        if (msg.messageType === OldStreamMessageType.MESSAGE) {
            content = msg.serializedContent
            messageType = StreamMessageType.MESSAGE
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_REQUEST) {
            content = GroupKeyRequest.toBinary(
                GroupKeyRequestTranslator.toProtobuf(
                    OldGroupKeyRequest.deserialize(
                        binaryToUtf8(msg.serializedContent),
                        OldStreamMessageType.GROUP_KEY_REQUEST) as OldGroupKeyRequest
                )
            )
            messageType = StreamMessageType.GROUP_KEY_REQUEST
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_RESPONSE) {
            content = GroupKeyResponse.toBinary(
                GroupKeyResponseTranslator.toProtobuf(
                    OldGroupKeyResponse.deserialize(
                        binaryToUtf8(msg.serializedContent),
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
                id: msg.getNewGroupKey()!.groupKeyId,
                data: msg.getNewGroupKey()!.data
            }
        }
        const translated: StreamMessage = {
            messageId,
            previousMessageRef,
            content,
            messageType,
            contentType: ContentType.JSON,
            encryptionType: oldToNewEncryptionType(msg.encryptionType),
            groupKeyId: msg.groupKeyId ?? undefined,
            newGroupKey,
            signature: msg.signature
        }
        return translated
    }

    static toClientProtocol(msg: StreamMessage): OldStreamMessage {
        let content: Uint8Array
        let messageType: OldStreamMessageType
        if (msg.messageType === StreamMessageType.MESSAGE) {
            messageType = OldStreamMessageType.MESSAGE
            content = msg.content
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_REQUEST) {
            messageType = OldStreamMessageType.GROUP_KEY_REQUEST
            content = utf8ToBinary(GroupKeyRequestTranslator.toClientProtocol(GroupKeyRequest.fromBinary(msg.content)).serialize())
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_RESPONSE) {
            messageType = OldStreamMessageType.GROUP_KEY_RESPONSE
            content = utf8ToBinary(GroupKeyResponseTranslator.toClientProtocol(GroupKeyResponse.fromBinary(msg.content)).serialize())
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
            prevMsgRef = new OldMessageRef(Number(msg.previousMessageRef.timestamp), msg.previousMessageRef.sequenceNumber)
        }
        let newGroupKey: OldEncryptedGroupKey | undefined = undefined
        if (msg.newGroupKey) {
            newGroupKey = new OldEncryptedGroupKey(
                msg.newGroupKey!.id,
                msg.newGroupKey!.data,
            )
        }
        const translated = new OldStreamMessage({
            messageId,
            prevMsgRef,
            content,
            messageType,
            contentType: OldContentType.JSON,
            encryptionType: newToOldEncryptionType(msg.encryptionType),
            groupKeyId: msg.groupKeyId,
            newGroupKey,
            signature: msg.signature
        })
        return translated
    }
}
